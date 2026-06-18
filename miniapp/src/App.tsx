import { useState } from "react";
import { IS_MOCK } from "./sdk/api";
import { initTwa } from "./sdk/twa";
import { Wishlist } from "./screens/Wishlist";
import { Bucket } from "./screens/Bucket";
import { Countdowns } from "./screens/Countdowns";
import { Mood } from "./screens/Mood";
import { QuestionOfTheDay } from "./screens/QuestionOfTheDay";
import { Gifts } from "./screens/Gifts";
import { MilestoneToast, type MilestoneEvent } from "./components/Toast";
import { useMilestoneToast } from "./lib/milestoneBus";
import { StatsCard } from "./components/Stats";
import { NavBar, type Tab } from "./components/NavBar";

// Initialise the Telegram WebApp SDK once (no-op outside Telegram).
initTwa();

export default function App() {
  const [tab, setTab] = useState<Tab>("wishlist");
  const [milestone, dismissMilestone] = useMilestoneToast();

  return (
    <div className="relative z-[1] flex min-h-full flex-col">
      {IS_MOCK ? (
        <div className="bg-amber-500/10 px-4 py-1 text-center text-xs text-amber-600">
          demo-режим: показаны примеры данных
        </div>
      ) : null}

      {milestone ? (
        <MilestoneToast
          events={[milestone] as MilestoneEvent[]}
          onDismiss={dismissMilestone}
        />
      ) : null}

      <StatsCard />

      <main className="flex-1">
        {tab === "wishlist" ? <Wishlist /> : null}
        {tab === "bucket" ? <Bucket /> : null}
        {tab === "countdowns" ? <Countdowns /> : null}
        {tab === "mood" ? <Mood /> : null}
        {tab === "qotd" ? <QuestionOfTheDay /> : null}
        {tab === "gifts" ? <Gifts /> : null}
      </main>

      <NavBar tab={tab} onTabChange={setTab} />
    </div>
  );
}
