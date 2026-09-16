"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;

      tg.ready();
      tg.expand();

      const telegramUser = tg.initDataUnsafe?.user;

      if (telegramUser) {
        setUser(telegramUser);
      }
    }
  }, []);

  return (
    <main className="container">
      <div className="card">
        <div className="title">
          👋 Welcome
        </div>

        <div className="muted">
          {user
            ? `${user.first_name || "User"}`
            : "Telegram User"}
        </div>
      </div>

      <div className="card">
        <div className="muted">Your Balance</div>

        <div className="balance">
          ${balance}
        </div>

        <div className="muted">
          Available earnings
        </div>
      </div>

      <div className="card">
        <button className="btn">
          📺 Watch Ads
        </button>
      </div>

      <div className="card">
        <button className="btn">
          🎁 Daily Bonus
        </button>
      </div>

      <div className="card">
        <button className="btn">
          👥 Refer & Earn
        </button>
      </div>

      <div className="card">
        <button className="btn">
          💳 Withdraw
        </button>
      </div>

      <div className="card">
        <button className="btn">
          📊 Earning History
        </button>
      </div>
    </main>
  );
}
