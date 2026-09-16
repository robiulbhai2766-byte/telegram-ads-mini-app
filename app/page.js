"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [adLoading, setAdLoading] = useState(false);
  const [adSession, setAdSession] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [adCompleted, setAdCompleted] = useState(false);

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

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((value) => value - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  async function startAd() {
    try {
      const tg = window.Telegram?.WebApp;

      if (!tg?.initData) {
        setMessage("Please open the app from Telegram.");
        return;
      }

      setAdLoading(true);
      setMessage("");

      const response = await fetch("/api/ads/start", {
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
        setMessage(result.message || "Advertisement unavailable.");
        setAdLoading(false);
        return;
      }

      setAdSession(result);
      setAdCompleted(false);

      // Minimum server-side watch time
      setCountdown(15);

      // Open advertiser URL in a new tab/window
      window.open(result.ad.url, "_blank");

      setAdLoading(false);

    } catch (error) {
      console.error(error);
      setMessage("Unable to start advertisement.");
      setAdLoading(false);
    }
  }

  async function completeAd() {
    try {
      const tg = window.Telegram?.WebApp;

      if (!tg?.initData || !adSession?.sessionId) {
        setMessage("Invalid advertisement session.");
        return;
      }

      if (countdown > 0) {
        setMessage(
          `Please complete the advertisement. ${countdown} seconds remaining.`
        );
        return;
      }

      setAdLoading(true);
      setMessage("");

      const response = await fetch("/api/ads/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          initData: tg.initData,
          sessionId: adSession.sessionId
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setMessage(
          result.message || "Advertisement verification failed."
        );
        setAdLoading(false);
        return;
      }

      setBalance(
        Number(result.balance || 0).toFixed(2)
      );

      setMessage(
        `✅ Ad verified. You earned $${Number(
          result.reward || 0
        ).toFixed(2)}`
      );

      setAdCompleted(true);
      setAdSession(null);
      setAdLoading(false);

    } catch (error) {
      console.error(error);
      setMessage("Verification failed.");
      setAdLoading(false);
    }
  }

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
          {user?.first_name || "Telegram User"}
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

      {!adSession && !adCompleted && (
        <div className="card">
          <button
            className="btn"
            onClick={startAd}
            disabled={adLoading}
          >
            {adLoading
              ? "⏳ Starting..."
              : "📺 Watch Ads"}
          </button>
        </div>
      )}

      {adSession && !adCompleted && (
        <div className="card">

          <div className="title">
            📺 Advertisement
          </div>

          <p>
            {adSession.ad?.title || "Sponsored Advertisement"}
          </p>

          <p className="muted">
            Please complete the advertisement.
          </p>

          {countdown > 0 ? (
            <button
              className="btn"
              disabled
            >
              ⏱️ Wait {countdown}s
            </button>
          ) : (
            <button
              className="btn"
              onClick={completeAd}
              disabled={adLoading}
            >
              {adLoading
                ? "🔍 Verifying..."
                : "✅ Complete & Verify"}
            </button>
          )}

        </div>
      )}

      {adCompleted && (
        <div className="card">

          <div className="title">
            ✅ Advertisement Completed
          </div>

          <p className="muted">
            Your reward has been verified.
          </p>

          <button
            className="btn"
            onClick={() => {
              setAdCompleted(false);
              setMessage("");
            }}
          >
            📺 Watch Another Ad
          </button>

        </div>
      )}

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
