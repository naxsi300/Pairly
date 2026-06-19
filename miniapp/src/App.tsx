import { useState } from "react";
import { IS_MOCK } from "./sdk/api";
import { initTwa } from "./sdk/twa";
import { Wishlist } from "./screens/Wishlist";
import { Bucket } from "./screens/Bucket";
import { Countdowns } from "./screens/Countdowns";
import { Mood } from "./screens/Mood";
import { QuestionOfTheDay } from "./screens/QuestionOfTheDay";
import { Gifts } from "./screens/Gifts";
import { Home } from "./screens/Home";
import { LoveNotes } from "./screens/LoveNotes";
import { MilestoneToast, type MilestoneEvent } from "./components/Toast";
import { useMilestoneToast } from "./lib/milestoneBus";
import { NavBar, type Tab } from "./components/NavBar";
import type { Destination } from "./components/MoreSheet";

initTwa();

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [dest, setDest] = useState<Destination | null>(null);
  const [milestone, dismissMilestone] = useMilestoneToast();

  return (
    <div className="relative z-[1] flex min-h-full flex-col">
      {IS_MOCK ? (
        <div className="bg-amber-500/10 px-4 py-1 text-center text-xs text-amber-600">
          demo-режим: показаны примеры данных
        </div>
      ) : null}
      {milestone ? (
        <MilestoneToast events={[milestone] as MilestoneEvent[]} onDismiss={dismissMilestone} />
      ) : null}

      <main className="app-scroll flex-1">
        {dest ? (
          <DestinationView dest={dest} onBack={() => setDest(null)} />
        ) : (
          <>
            {tab === "home" ? <Home onOpen={(d) => setDest(d)} /> : null}
            {tab === "wishlist" ? <Wishlist /> : null}
            {tab === "mood" ? <Mood /> : null}
          </>
        )}
      </main>

      <NavBar tab={tab} onTabChange={(t) => { setTab(t); setDest(null); }} />
    </div>
  );
}

function DestinationView({ dest, onBack }: { dest: Destination; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <button onClick={onBack} className="mb-2 text-sm" style={{ color: "var(--m3-primary)" }}>← Назад</button>
      {dest === "bucket" ? <Bucket /> : null}
      {dest === "countdowns" ? <Countdowns /> : null}
      {dest === "gifts" ? <Gifts /> : null}
      {dest === "qotd" ? <QuestionOfTheDay /> : null}
      {dest === "notes" ? <LoveNotes /> : null}
    </div>
  );
}
