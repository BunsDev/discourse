import {
  acceptance,
  loggedInUser,
  publishToMessageBus,
  query,
} from "discourse/tests/helpers/qunit-helpers";
import { skip, test } from "qunit";
import {
  click,
  fillIn,
  triggerEvent,
  triggerKeyEvent,
  visit,
  waitFor,
} from "@ember/test-helpers";
import pretender from "discourse/tests/helpers/create-pretender";

acceptance("Chat | User status on mentions", function (needs) {
  const actingUser = {
    id: 1,
    username: "acting_user",
  };
  const channelId = 1;
  const messageId = 1891;
  const mentionedUser1 = {
    id: 1000,
    username: "user1",
    status: {
      description: "surfing",
      emoji: "surfing_man",
    },
  };
  const mentionedUser2 = {
    id: 2000,
    username: "user2",
    status: {
      description: "vacation",
      emoji: "desert_island",
    },
  };
  const mentionedUser3 = {
    id: 3000,
    username: "user3",
    status: {
      description: "off to dentist",
      emoji: "tooth",
    },
  };
  const message = {
    id: messageId,
    message: `Hey @${mentionedUser1.username}`,
    cooked: `<p>Hey <a class="mention" href="/u/${mentionedUser1.username}">@${mentionedUser1.username}</a></p>`,
    mentioned_users: [mentionedUser1],
    user: actingUser,
  };
  const messagesResponse = {
    meta: {
      channel_id: channelId,
      can_delete_self: true,
    },
    chat_messages: [message],
  };
  const newStatus = {
    description: "working remotely",
    emoji: "house",
  };

  needs.settings({ chat_enabled: true });

  needs.user({
    ...actingUser,
    has_chat_enabled: true,
    chat_channels: {
      public_channels: [
        {
          id: channelId,
          chatable_id: 1,
          chatable_type: "Category",
          meta: { message_bus_last_ids: {} },
          current_user_membership: { following: true },
          chatable: { id: 1 },
        },
      ],
      direct_message_channels: [],
      meta: { message_bus_last_ids: {} },
    },
  });

  needs.hooks.beforeEach(function () {
    pretender.get(`/chat/1/messages`, () => [200, {}, messagesResponse]);
    pretender.post(`/chat/1`, () => OK);
    pretender.put(`/chat/1/edit/${messageId}`, () => OK);
    pretender.post(`/chat/drafts`, () => OK);
    pretender.delete(`/chat/api/channels/1/messages/${messageId}`, () => OK);
    pretender.put(
      `/chat/api/channels/1/messages/${messageId}/restore`,
      () => OK
    );

    setupAutocompleteResponses([mentionedUser2, mentionedUser3]);
  });

  test("just posted messages | it shows status on mentions ", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);
    await typeWithAutocompleteAndSend(`mentioning @${mentionedUser2.username}`);
    assertStatusIsRendered(
      assert,
      `.mention[href='/u/${mentionedUser2.username}'] .user-status`,
      mentionedUser2.status
    );
  });

  test("just posted messages | it updates status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);
    await typeWithAutocompleteAndSend(`mentioning @${mentionedUser2.username}`);

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser2.id]: newStatus,
    });

    const selector = `.mention[href='/u/${mentionedUser2.username}'] .user-status`;
    await waitFor(selector);
    assertStatusIsRendered(assert, selector, newStatus);
  });

  test("just posted messages | it deletes status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await typeWithAutocompleteAndSend(`mentioning @${mentionedUser2.username}`);

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser2.id]: null,
    });

    const selector = `.mention[href='/u/${mentionedUser2.username}'] .user-status`;
    await waitFor(selector, { count: 0 });
    assert.dom(selector).doesNotExist("status is deleted");
  });

  test("edited messages | it shows status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await editMessage(
      ".chat-message-content",
      `mentioning @${mentionedUser3.username}`
    );

    assertStatusIsRendered(
      assert,
      `.mention[href='/u/${mentionedUser3.username}'] .user-status`,
      mentionedUser3.status
    );
  });

  skip("edited messages | it updates status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);
    await editMessage(
      ".chat-message-content",
      `mentioning @${mentionedUser3.username}`
    );

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser3.id]: newStatus,
    });

    const selector = `.mention[href='/u/${mentionedUser3.username}'] .user-status`;
    await waitFor(selector);
    assertStatusIsRendered(assert, selector, newStatus);
  });

  skip("edited messages | it deletes status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await editMessage(
      ".chat-message-content",
      `mentioning @${mentionedUser3.username}`
    );

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser3.id]: null,
    });

    const selector = `.mention[href='/u/${mentionedUser3.username}'] .user-status`;
    await waitFor(selector, { count: 0 });
    assert.dom(selector).doesNotExist("status is deleted");
  });

  test("deleted messages | it shows status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await deleteMessage(".chat-message-content");
    await click(".chat-message-expand");

    assertStatusIsRendered(
      assert,
      `.mention[href='/u/${mentionedUser1.username}'] .user-status`,
      mentionedUser1.status
    );
  });

  test("deleted messages | it updates status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await deleteMessage(".chat-message-content");
    await click(".chat-message-expand");

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser1.id]: newStatus,
    });

    const selector = `.mention[href='/u/${mentionedUser1.username}'] .user-status`;
    await waitFor(selector);
    assertStatusIsRendered(assert, selector, newStatus);
  });

  test("deleted messages | it deletes status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await deleteMessage(".chat-message-content");
    await click(".chat-message-expand");

    loggedInUser().appEvents.trigger("user-status:changed", {
      [mentionedUser1.id]: null,
    });

    const selector = `.mention[href='/u/${mentionedUser1.username}'] .user-status`;
    await waitFor(selector, { count: 0 });
    assert.dom(selector).doesNotExist("status is deleted");
  });

  test("restored messages | it shows status on mentions", async function (assert) {
    await visit(`/chat/c/-/${channelId}`);

    await deleteMessage(".chat-message-content");
    await restoreMessage(".chat-message-content");

    assertStatusIsRendered(
      assert,
      `.mention[href='/u/${mentionedUser1.username}'] .user-status`,
      mentionedUser1.status
    );
  });

  function assertStatusIsRendered(assert, selector, status) {
    assert
      .dom(selector)
      .exists("status is rendered")
      .hasAttribute(
        "title",
        status.description,
        "status description is updated"
      )
      .hasAttribute(
        "src",
        new RegExp(`${status.emoji}.png`),
        "status emoji is updated"
      );
  }

  async function deleteMessage(messageSelector) {
    await triggerEvent(query(messageSelector), "mouseenter");
    await click(".more-buttons .select-kit-header-wrapper");
    await click(".select-kit-collection .select-kit-row[data-value='delete']");
    await publishToMessageBus(`/chat/${channelId}`, {
      type: "delete",
      deleted_id: messageId,
      deleted_at: "2022-01-01T08:00:00.000Z",
    });
  }

  async function editMessage(messageSelector, text) {
    await triggerEvent(query(messageSelector), "mouseenter");
    await click(".more-buttons .select-kit-header-wrapper");
    await click(".select-kit-collection .select-kit-row[data-value='edit']");
    await typeWithAutocompleteAndSend(text);
  }

  async function restoreMessage(messageSelector) {
    await triggerEvent(query(messageSelector), "mouseenter");
    await click(".more-buttons .select-kit-header-wrapper");
    await click(".select-kit-collection .select-kit-row[data-value='restore']");
    await publishToMessageBus(`/chat/${channelId}`, {
      type: "restore",
      chat_message: message,
    });

    // data: {
    //   chat_message: {
    //     id: 2137,
    //     message: "test",
    //     cooked: "<p>test</p>",
    //     created_at: "2023-05-17T22:15:38.972Z",
    //     excerpt: "test",
    //     available_flags: [],
    //     thread_title: null,
    //     chat_channel_id: 1,
    //     mentioned_users: [],
    //     user: {
    //       id: 1,
    //       username: "admin1",
    //       name: null,
    //       avatar_template:
    //         "/letter_avatar_proxy/v4/letter/a/bbce88/{size}.png",
    //       status: {
    //         description: "test",
    //         emoji: "hole",
    //         ends_at: null,
    //         message_bus_last_id: 29,
    //       },
    //       moderator: false,
    //       admin: true,
    //       staff: true,
    //       new_user: false,
    //       primary_group_name: null,
    //     },
    //     chat_webhook_event: null,
    //     uploads: [],
    //   },
    //   type: "restore",
    // },
  }

  async function emulateAutocomplete(inputSelector, text) {
    await triggerKeyEvent(inputSelector, "keydown", "Backspace");
    await fillIn(inputSelector, `${text} `);
    await triggerKeyEvent(inputSelector, "keyup", "Backspace");

    await triggerKeyEvent(inputSelector, "keydown", "Backspace");
    await fillIn(inputSelector, text);
    await triggerKeyEvent(inputSelector, "keyup", "Backspace");
  }

  async function typeWithAutocompleteAndSend(text) {
    await emulateAutocomplete(".chat-composer__input", text);
    await click(".autocomplete.ac-user .selected");
    await triggerKeyEvent(".chat-composer__input", "keydown", "Enter");
  }

  function setupAutocompleteResponses(results) {
    pretender.get("/u/search/users", () => {
      return [
        200,
        {},
        {
          users: results,
        },
      ];
    });

    pretender.get("/chat/api/mentions/groups.json", () => {
      return [
        200,
        {},
        {
          unreachable: [],
          over_members_limit: [],
          invalid: ["and"],
        },
      ];
    });
  }

  const OK = [200, {}, {}];
});
