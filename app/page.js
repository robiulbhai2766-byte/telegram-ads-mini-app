"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [tg, setTg] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [adLoading, setAdLoading] = useState(false);
  const [adSession, setAdSession] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadTelegramUser() {
      try {
        if (!window.Telegram?.WebApp) {
          setError(
            "Please open this app from Telegram."
          );
          setLoading(false);
          return;
        }

        const telegram = window.Telegram.WebApp;

        telegram.ready();
        telegram.expand();

        setTg(telegram);

        if (!telegram.initData) {
          setError(
            "Telegram authentication data is missing."
          );
          setLoading(false);
          return;
        }

        const response = await fetch(
          "/api/telegram/user",
          {
            method: "GET",
            headers: {
              "x-telegram-init-data":
                telegram.initData
            },
            cache: "no-store"
          }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              "Unable to load Telegram account."
          );
        }

        setUser(data.user);
        setError("");
      } catch (err) {
        console.error(
          "USER_LOAD_ERROR:",
          err
        );

        setError(
          err?.message ||
            "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTelegramUser();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          clearInterval(timer);
          return 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  async function startAd() {
    if (!tg?.initData) {
      setMessage(
        "Telegram authentication data is missing."
      );
      return;
    }

    try {
      setAdLoading(true);
      setMessage("");

      const response = await fetch(
        "/api/ads/start",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            initData: tg.initData
          }),
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to start advertisement."
        );
        return;
      }

      setAdSession(data);
      setCountdown(15);

      if (data.ad?.url) {
        window.open(
          data.ad.url,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (err) {
      console.error(
        "START_AD_ERROR:",
        err
      );

      setMessage(
        "Unable to start advertisement."
      );
    } finally {
      setAdLoading(false);
    }
  }

  async function completeAd() {
    if (!adSession?.sessionId) {
      return;
    }

    if (countdown > 0) {
      setMessage(
        `Please watch the advertisement. ${countdown} seconds remaining.`
      );
      return;
    }

    try {
      setMessage("");

      const response = await fetch(
        "/api/ads/complete",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            initData: tg.initData,
            sessionId:
              adSession.sessionId
          }),
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(
          data.message ||
            "Advertisement verification failed."
        );
        return;
      }

      setMessage(
        data.message ||
          `You earned $${Number(
            data.reward || 0
          ).toFixed(2)}`
      );

      setUser((current) => ({
        ...current,
        balance:
          data.newBalance ??
          current?.balance ??
          0,
        total_earned:
          Number(
            current?.total_earned || 0
          ) +
          Number(data.reward || 0)
      }));

      setAdSession(null);
      setCountdown(0);
    } catch (err) {
      console.error(
        "COMPLETE_AD_ERROR:",
        err
      );

      setMessage(
        "Advertisement verification failed."
      );
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h2>Loading...</h2>
          <p>Checking your Telegram account.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h2>Something went wrong</h2>

          <p style={styles.error}>
            {error}
          </p>

          <button
            style={styles.button}
            onClick={() =>
              window.location.reload()
            }
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1>Ads Earn</h1>

        <p>
          Welcome{" "}
          <strong>
            {user?.first_name ||
              user?.username ||
              "User"}
          </strong>
        </p>

        <div style={styles.balanceBox}>
          <div style={styles.balanceLabel}>
            Balance
          </div>

          <div style={styles.balance}>
            $
            {Number(
              user?.balance || 0
            ).toFixed(2)}
          </div>
        </div>

        {!adSession ? (
          <button
            style={styles.button}
            onClick={startAd}
            disabled={adLoading}
          >
            {adLoading
              ? "Starting..."
              : "Watch Ad"}
          </button>
        ) : (
          <div>
            <p>
              Advertisement started.
            </p>

            <p>
              Time remaining:{" "}
              <strong>
                {countdown}s
              </strong>
            </p>

            <button
              style={styles.button}
              onClick={completeAd}
              disabled={countdown > 0}
            >
              {countdown > 0
                ? `Wait ${countdown}s`
                : "Complete Ad"}
            </button>
          </div>
        )}

        {message && (
          <p style={styles.message}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    padding: "20px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily:
      "Arial, sans-serif"
  },

  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    borderRadius: "18px",
    padding: "25px",
    marginTop: "20px",
    textAlign: "center",
    boxShadow:
      "0 5px 20px rgba(0,0,0,0.08)"
  },

  balanceBox: {
    background: "#f0f2f5",
    borderRadius: "15px",
    padding: "20px",
    margin: "20px 0"
  },

  balanceLabel: {
    fontSize: "14px",
    color: "#666"
  },

  balance: {
    fontSize: "32px",
    fontWeight: "bold",
    marginTop: "5px"
  },

  button: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "12px",
    background: "#0088cc",
    color: "#fff",
    fontSize: "17px",
    fontWeight: "bold",
    cursor: "pointer"
  },

  error: {
    color: "#c62828",
    margin: "15px 0"
  },

  message: {
    marginTop: "18px",
    fontSize: "14px"
  }
};
