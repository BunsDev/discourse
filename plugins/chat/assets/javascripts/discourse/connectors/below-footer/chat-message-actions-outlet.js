import { getOwner } from "discourse-common/lib/get-owner";
import { MESSAGE_CONTEXT_THREAD } from "discourse/plugins/chat/discourse/components/chat-message";
import { schedule } from "@ember/runloop";
import { createPopper } from "@popperjs/core";
const MSG_ACTIONS_VERTICAL_PADDING = -10;

export default {
  setupComponent(args, component) {
    const container = getOwner(this);
    const chat = container.lookup("service:chat");
    component.chat = chat;
    const site = container.lookup("service:site");
    component.siteService = site;

    let popper;

    component.setMessageActionsMobileAnchor = (element, [activeMessage]) => {
      if (!activeMessage) {
        return;
      }

      if (activeMessage.context === MESSAGE_CONTEXT_THREAD) {
        component.set(
          "messageActionsMobileAnchor",
          container.lookup("service:chat-channel-thread-pane")
            .chatMessageActionsMobileAnchor
        );
      } else {
        component.set(
          "messageActionsMobileAnchor",
          container.lookup("service:chat-channel-pane")
            .chatMessageActionsMobileAnchor
        );
      }
    };

    component.positionContainer = (element, [activeMessage]) => {
      popper?.destroy();

      schedule("afterRender", () => {
        let selector;

        if (!activeMessage) {
          return;
        }

        if (activeMessage.context === MESSAGE_CONTEXT_THREAD) {
          selector = `.chat-thread .chat-message-container[data-id="${activeMessage.model.id}"]`;
        } else {
          selector = `.chat-live-pane .chat-message-container[data-id="${activeMessage.model.id}"]`;
        }

        popper = createPopper(document.querySelector(selector), element, {
          placement: "top-end",
          strategy: "fixed",
          modifiers: [
            { name: "hide", enabled: true },
            { name: "eventListeners", options: { scroll: false } },
            {
              name: "offset",
              options: { offset: [-2, MSG_ACTIONS_VERTICAL_PADDING] },
            },
          ],
        });
      });
    };
  },
};
