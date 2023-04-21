# frozen_string_literal: true

module Chat
  # Service responsible for creating a new direct message chat channel.
  # The guardian passed in is the "acting user" when creating the channel
  # and deciding whether the actor can communicate with the users that
  # are passed in.
  #
  # @example
  #  Service::Chat::CreateDirectMessageChannel.call(
  #    guardian: guardian,
  #    target_user_usernames: ["bob", "alice"]
  #  )
  #
  class CreateDirectMessageChannel
    include Service::Base

    # @!method call(guardian:, **params_to_create)
    #   @param [Guardian] guardian
    #   @param [Hash] params_to_create
    #   @option params_to_create [Array<String>] target_user_usernames
    #   @return [Service::Base::Context]

    policy :can_create_direct_message
    contract
    model :target_users
    policy :does_not_exceed_max_direct_message_users
    model :user_comm_screener
    policy :acting_user_not_disallowing_all_messages
    policy :acting_user_can_message_all_target_users
    policy :acting_user_not_preventing_messages_from_any_target_users
    policy :acting_user_not_ignoring_any_target_users
    policy :acting_user_not_muting_any_target_users
    model :direct_message, :fetch_or_create_direct_message
    model :channel, :fetch_or_create_channel
    step :update_memberships
    step :publish_channel

    # @!visibility private
    class Contract
      attribute :target_user_usernames

      before_validation do
        target_user_usernames =
          (
            if target_user_usernames.is_a?(String)
              target_user_usernames.split(",")
            else
              target_user_usernames
            end
          )
      end

      validates :target_user_usernames, presence: true, length: { min: 1 }
    end

    private

    def can_create_direct_message?(guardian:, **)
      guardian.can_create_direct_message?
    end

    def fetch_target_users(guardian:, contract:, **)
      users = [guardian.user]
      other_usernames = contract.target_user_usernames - [guardian.user.username]
      users.concat(User.where(username: other_usernames).to_a) if other_usernames.any?
      users.uniq!
    end

    def can_message_others(target_users:, guardian:, **)
      return true if SiteSetting.chat_max_direct_message_users > 0 || guardian.staff?
      target_users.reject { |user| user.id == acting_user.id }.size >
        SiteSetting.chat_max_direct_message_users
    end

    def does_not_exceed_max_direct_message_users(target_users:, guardian:, **)
      target_users = target_users.reject { |user| user.id == acting_user.id }
      guardian.staff? || target_users.size <= SiteSetting.chat_max_direct_message_users
    end

    def fetch_user_comm_screener(target_users:, guardian:, **)
      UserCommScreener.new(acting_user: guardian.user, target_user_ids: target_users.map(&:id))
    end

    def acting_user_not_disallowing_all_messages(user_comm_screener:, **)
      !screener.actor_disallowing_all_pms?
    end

    def acting_user_can_message_all_target_users(user_comm_screener:, target_users:, **)
      return true if user_comm_screener.preventing_actor_communication.none?
      context.merge(
        preventing_communication_username:
          target_users
            .find { |user| user.id == user_comm_screener.preventing_actor_communication.first }
            .username,
      )
      false
    end

    def acting_user_not_preventing_messages_from_any_target_users(
      user_comm_screener:,
      target_users:,
      **
    )
      problem_user =
        target_users.find do |target_user|
          user_comm_screener.actor_disallowing_pms?(target_user.id)
        end
      return true if problem_user.blank?
      context.merge(preventing_communication_username: problem_user.username)
      false
    end

    def acting_user_not_ignoring_any_target_users(user_comm_screener:, target_users:, **)
      problem_user =
        target_users.find { |target_user| user_comm_screener.actor_ignoring?(target_user.id) }
      return true if problem_user.blank?
      context.merge(preventing_communication_username: problem_user.username)
      false
    end

    def acting_user_not_muting_any_target_users(user_comm_screener:, target_users:, **)
      problem_user =
        target_users.find { |target_user| user_comm_screener.actor_muting?(target_user.id) }
      return true if problem_user.blank?
      context.merge(preventing_communication_username: problem_user.username)
      false
    end

    def fetch_or_create_direct_message(target_users:, **)
      direct_message = Chat::DirectMessage.for_user_ids(target_users.map(&:id))
      return direct_message if direct_message.present?
      Chat::DirectMessage.create(user_ids: target_users.map(&:id))
    end

    def fetch_or_create_channel(direct_message:, **)
      channel = Chat::Channel.find_by(chatable: direct_message)
      channel.present? ? channel : direct_message.create_chat_channel!
    end

    def update_memberships(guardian:, channel:, target_users:, **)
      sql_params = {
        acting_user_id: guardian.user.id,
        user_ids: target_users.map(&:id),
        chat_channel_id: channel.id,
        always_notification_level: Chat::UserChatChannelMembership::NOTIFICATION_LEVELS[:always],
      }

      DB.exec(<<~SQL, sql_params)
        INSERT INTO user_chat_channel_memberships(
          user_id,
          chat_channel_id,
          muted,
          following,
          desktop_notification_level,
          mobile_notification_level,
          created_at,
          updated_at
        )
        VALUES(
          unnest(array[:user_ids]),
          :chat_channel_id,
          false,
          false,
          :always_notification_level,
          :always_notification_level,
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id, chat_channel_id) DO NOTHING;

        UPDATE user_chat_channel_memberships
        SET following = true
        WHERE user_id = :acting_user_id AND chat_channel_id = :chat_channel_id;
      SQL
    end

    def publish_channel(channel:, target_users:, **)
      Chat::Publisher.publish_new_channel(channel, target_users)
    end
  end
end
