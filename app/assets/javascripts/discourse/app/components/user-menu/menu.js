import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { NO_REMINDER_ICON } from "discourse/models/bookmark";
import UserMenuTab, { CUSTOM_TABS_CLASSES } from "discourse/lib/user-menu/tab";
import { inject as service } from "@ember/service";
import getUrl from "discourse-common/lib/get-url";
import { wantsNewWindow } from "discourse/lib/intercept-click";
import UserMenuNotificationsList from "./notifications-list";
import UserMenuRepliesNotificationsList from "./replies-notifications-list";
import UserMenuLikesNotificationsList from "./likes-notifications-list";
import UserMenuMessagesList from "./messages-list";
import UserMenuBookmarksList from "./bookmarks-list";
import UserMenuReviewablesList from "./reviewables-list";
import UserMenuProfileTabContent from "./profile-tab-content";
import UserMenuOtherNotificationsList from "./other-notifications-list";
import deprecated from "discourse-common/lib/deprecated";
import { getOwner } from "discourse-common/lib/get-owner";

const DEFAULT_TAB_ID = "all-notifications";
const DEFAULT_PANEL_COMPONENT = UserMenuNotificationsList;

const REVIEW_QUEUE_TAB_ID = "review-queue";

const CORE_TOP_TABS = [
  class extends UserMenuTab {
    id = DEFAULT_TAB_ID;
    icon = "bell";
    panelComponent = DEFAULT_PANEL_COMPONENT;

    get linkWhenActive() {
      return `${this.currentUser.path}/notifications`;
    }
  },

  class extends UserMenuTab {
    id = "replies";
    icon = "reply";
    panelComponent = UserMenuRepliesNotificationsList;
    notificationTypes = ["mentioned", "posted", "quoted", "replied"];

    get count() {
      return (
        this.getUnreadCountForType("mentioned") +
        this.getUnreadCountForType("posted") +
        this.getUnreadCountForType("quoted") +
        this.getUnreadCountForType("replied")
      );
    }

    get linkWhenActive() {
      return `${this.currentUser.path}/notifications/responses`;
    }
  },

  class extends UserMenuTab {
    id = "likes";
    icon = "heart";
    panelComponent = UserMenuLikesNotificationsList;

    get shouldDisplay() {
      return !this.currentUser.user_option.likes_notifications_disabled;
    }

    get count() {
      return this.getUnreadCountForType("liked");
    }

    // TODO(osama): reaction is a type used by the reactions plugin, but it's
    // added here temporarily unitl we add a plugin API for extending
    // filterByTypes in lists
    get notificationTypes() {
      return ["liked", "liked_consolidated", "reaction"];
    }

    get linkWhenActive() {
      return `${this.currentUser.path}/notifications/likes-received`;
    }
  },

  class extends UserMenuTab {
    id = "messages";
    icon = "notification.private_message";
    panelComponent = UserMenuMessagesList;
    notificationTypes = ["private_message", "group_message_summary"];

    get count() {
      return this.getUnreadCountForType("private_message");
    }

    get shouldDisplay() {
      return this.currentUser?.can_send_private_messages;
    }

    get linkWhenActive() {
      return `${this.currentUser.path}/messages`;
    }
  },

  class extends UserMenuTab {
    id = "bookmarks";
    icon = NO_REMINDER_ICON;
    panelComponent = UserMenuBookmarksList;
    notificationTypes = ["bookmark_reminder"];

    get count() {
      return this.getUnreadCountForType("bookmark_reminder");
    }

    get linkWhenActive() {
      return `${this.currentUser.path}/activity/bookmarks`;
    }
  },

  class extends UserMenuTab {
    id = REVIEW_QUEUE_TAB_ID;
    icon = "flag";
    panelComponent = UserMenuReviewablesList;
    linkWhenActive = getUrl("/review");

    get shouldDisplay() {
      return (
        this.currentUser.can_review && this.currentUser.get("reviewable_count")
      );
    }

    get count() {
      return this.currentUser.get("reviewable_count");
    }
  },
];

const CORE_BOTTOM_TABS = [
  class extends UserMenuTab {
    id = "profile";
    icon = "user";
    panelComponent = UserMenuProfileTabContent;

    get linkWhenActive() {
      return `${this.currentUser.path}/summary`;
    }
  },
];

const CORE_OTHER_NOTIFICATIONS_TAB = class extends UserMenuTab {
  id = "other-notifications";
  icon = "discourse-other-tab";
  panelComponent = UserMenuOtherNotificationsList;

  constructor(currentUser, siteSettings, site, otherNotificationTypes) {
    super(...arguments);
    this.otherNotificationTypes = otherNotificationTypes;
  }

  get count() {
    return this.otherNotificationTypes.reduce((sum, notificationType) => {
      return sum + this.getUnreadCountForType(notificationType);
    }, 0);
  }

  get notificationTypes() {
    return this.otherNotificationTypes;
  }
};

function resolvePanelComponent(owner, panelComponent) {
  if (typeof panelComponent === "string") {
    const nameForConsole = JSON.stringify(panelComponent);
    deprecated(
      `user-menu tab panelComponent must be passed as a component class (passed ${nameForConsole})`,
      { id: "discourse.user-menu.panel-component-class" }
    );
    return owner.resolveRegistration(`component:${panelComponent}`);
  }
  return panelComponent;
}

export default class UserMenu extends Component {
  @service currentUser;
  @service siteSettings;
  @service site;
  @service appEvents;

  @tracked currentTabId = DEFAULT_TAB_ID;
  @tracked currentPanelComponent = DEFAULT_PANEL_COMPONENT;
  @tracked currentNotificationTypes;

  constructor() {
    super(...arguments);
    this.topTabs = this._topTabs;
    this.bottomTabs = this._bottomTabs;
  }

  get _topTabs() {
    const tabs = [];

    CORE_TOP_TABS.forEach((tabClass) => {
      const tab = new tabClass(this.currentUser, this.siteSettings, this.site);
      if (tab.shouldDisplay) {
        tabs.push(tab);
      }
    });

    let reviewQueueTabIndex = tabs.findIndex(
      (tab) => tab.id === REVIEW_QUEUE_TAB_ID
    );

    CUSTOM_TABS_CLASSES.forEach((tabClass) => {
      const tab = new tabClass(this.currentUser, this.siteSettings, this.site);
      if (tab.shouldDisplay) {
        if (reviewQueueTabIndex === -1) {
          tabs.push(tab);
        } else {
          tabs.insertAt(reviewQueueTabIndex, tab);
          reviewQueueTabIndex++;
        }
      }
    });

    tabs.push(
      new CORE_OTHER_NOTIFICATIONS_TAB(
        this.currentUser,
        this.siteSettings,
        this.site,
        this.#notificationTypesForTheOtherTab(tabs)
      )
    );

    return tabs.map((tab, index) => {
      tab.position = index;
      return tab;
    });
  }

  get _bottomTabs() {
    const tabs = [];

    CORE_BOTTOM_TABS.forEach((tabClass) => {
      const tab = new tabClass(this.currentUser, this.siteSettings, this.site);
      if (tab.shouldDisplay) {
        tabs.push(tab);
      }
    });

    const topTabsLength = this.topTabs.length;
    return tabs.map((tab, index) => {
      tab.position = index + topTabsLength;
      return tab;
    });
  }

  #notificationTypesForTheOtherTab(tabs) {
    const usedNotificationTypes = tabs
      .filter((tab) => tab.notificationTypes)
      .map((tab) => tab.notificationTypes)
      .flat();
    return Object.keys(this.site.notification_types).filter(
      (notificationType) => !usedNotificationTypes.includes(notificationType)
    );
  }

  @action
  handleTabClick(tab, event) {
    if (wantsNewWindow(event) || this.currentTabId === tab.id) {
      // Allow normal navigation to href
      return;
    }

    event.preventDefault();

    this.currentTabId = tab.id;
    this.currentPanelComponent = resolvePanelComponent(
      getOwner(this),
      tab.panelComponent
    );
    this.currentNotificationTypes = tab.notificationTypes;
  }

  @action
  triggerRenderedAppEvent() {
    this.appEvents.trigger("user-menu:rendered");
  }

  @action
  focusFirstTab(topTabsContainerElement) {
    topTabsContainerElement.querySelector(".btn.active")?.focus();
  }
}
