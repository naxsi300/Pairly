/** Tiny event bus for "soft milestone reached" notifications.

Screens call `emitMilestone(...)` after a create. App subscribes via
`onMilestone(...)` and renders a soft toast. The bus keeps only the latest
event so old toasts don't pile up.
*/

import { useEffect, useState } from "react";

export interface MilestoneEvent {
  kind: string;
  value: number;
}

type Listener = (e: MilestoneEvent) => void;
let lastEvent: MilestoneEvent | null = null;
const listeners = new Set<Listener>();

export function emitMilestone(e: MilestoneEvent) {
  lastEvent = e;
  for (const fn of listeners) fn(e);
}

export function onMilestone(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook: subscribes to the bus and re-emits the latest event. */
export function useMilestoneToast() {
  const [event, setEvent] = useState<MilestoneEvent | null>(lastEvent);
  useEffect(() => {
    return onMilestone((e) => setEvent(e));
  }, []);
  return [event, () => setEvent(null)] as const;
}
