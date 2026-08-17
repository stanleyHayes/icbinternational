'use client';

/**
 * The React shell over the guest chat controller.
 *
 * The lifecycle itself — stored session, REST calls, the live stream — lives in
 * `guest-chat-controller.ts`; this hook wires it to React: one controller per mounted
 * widget, the view snapshot through `useSyncExternalStore`, and the panel's open state
 * pushed in as it changes. Server and first client render agree because nothing touches
 * storage or the network until `setOpen(true)` runs in an effect after hydration.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { defaultCreateSocket, type CreateChatSocket } from './chat-stream';
import {
  GuestChatController,
  type GuestChatInput,
  type GuestChatView,
} from './guest-chat-controller';

export type { ChatSocket, CreateChatSocket } from './chat-stream';
export type { GuestChatInput, GuestChatPhase, GuestChatView } from './guest-chat-controller';

export interface GuestChatOptions {
  /** Whether the panel is open. Rehydration and the unread counter both hang off this. */
  readonly open: boolean;
  /** The socket factory. Fixed on first render; inject a fake in tests. */
  readonly createSocket?: CreateChatSocket;
}

export interface GuestChat extends GuestChatView {
  readonly startConversation: (input: GuestChatInput) => Promise<boolean>;
  readonly sendMessage: (body: string) => Promise<boolean>;
  readonly startNewChat: () => void;
}

/** Owns the guest chat lifecycle for the widget: pre-chat form, thread and live stream. */
export function useGuestChat({ open, createSocket = defaultCreateSocket }: GuestChatOptions): GuestChat {
  const [controller] = useState(() => new GuestChatController(createSocket));
  const view = useSyncExternalStore(controller.subscribe, controller.getView, controller.getView);

  useEffect(() => controller.dispose, [controller]);

  useEffect(() => {
    controller.setOpen(open);
  }, [controller, open]);

  return {
    ...view,
    startConversation: controller.startConversation,
    sendMessage: controller.sendMessage,
    startNewChat: controller.startNewChat,
  };
}
