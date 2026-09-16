"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function registerTelegramUser() {
      try {
        const tg = window.Telegram?.WebApp;

        if (!tg) {
          setMessage("Please open this Mini App from Telegram.");
          setLoading(false);
          return;
        }

        tg.ready();
        tg.expand();

        const telegramUser = tg.initDataUnsafe?.user;

        if (!telegramUser || !tg.initData) {
          setMessage("Telegram user data not available.");
          setLoading(false);
          return;
        }

        setUser(telegramUser);

        const response = await fetch("/api/telegram/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            initData: tg.initData
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          setMessage(result.message || "Registration failed.");
          setLoading(false);
          return;
        }

        setBalance(
          Number(result.user.balance || 0).toFixed(2)
        );

        setLoading(false);
      } catch (error) {
        console.error(error);
        setMessage("Something went wrong.");
        setLoading(false);
      }
    }

    registerTelegramUser();
  }, []);

  if (loading) {
    return (
      <main className="container">
        <div className="card">
          <div className="title">⏳ Loading...</div>
          <div className="muted">
            Connecting to Telegram
          </div>
        </div>
      </main>
    );
  }

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

        {message && (
          <p className="muted">
            {message}
          </p>
        )}
      </div>

      <div className="card">
        <div className="muted">
          Your Balance
        </div>

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
