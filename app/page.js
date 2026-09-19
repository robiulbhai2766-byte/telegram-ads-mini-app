"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [tg, setTg] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [adLoading, setAdLoading] = useState(false);
  const [adSession, setAdSession] = useState(null);
  const [adsgramReady, setAdsgramReady] = useState(false);

  const [bonusLoading, setBonusLoading] = useState(false);
  const [message, setMessage] = useState("");

  // =========================================================
  // LOAD TELEGRAM USER
  // =========================================================

  useEffect(() => {
    async function loadUser() {
      try {
        if (!window.Telegram?.WebApp) {
          setError("Please open this app from Telegram.");
          setLoading(false);
          return;
        }

        const telegram = window.Telegram.WebApp;

        telegram.ready();
        telegram.expand();

        setTg(telegram);

        if (!telegram.initData) {
          setError("Telegram authentication data is missing.");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/telegram/user", {
          method: "GET",
          headers: {
            "x-telegram-init-data": telegram.initData
          },
          cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load account."
          );
        }

        setUser(data.user);
      } catch (err) {
        console.error("LOAD_USER_ERROR", err);

        setError(
          err?.message || "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  // =========================================================
  // LOAD ADSGRAM SDK
  // =========================================================

  useEffect(() => {
    const scriptId = "adsgram-sdk";

    if (document.getElementById(scriptId)) {
      if (window.Adsgram) {
        setAdsgramReady(true);
      }

      return;
    }

    const script = document.createElement("script");

    script.id = scriptId;
    script.src = "https://sad.adsgram.ai/js/sad.min.js";
    script.async = true;

    script.onload = () => {
      if (window.Adsgram) {
        setAdsgramReady(true);
      } else {
        setAdsgramReady(false);
        setMessage("AdsGram SDK পাওয়া যায়নি।");
      }
    };

    script.onerror = () => {
      setAdsgramReady(false);
      setMessage(
        "AdsGram SDK load করা যায়নি।"
      );
    };

    document.head.appendChild(script);
  }, []);

  // =========================================================
  // START ADSGRAM REWARDED AD
  // =========================================================

  async function startAd() {
    if (!tg?.initData) {
      setMessage(
        "Telegram authentication data is missing."
      );
      return;
    }

    if (!adsgramReady || !window.Adsgram) {
      setMessage(
        "AdsGram is still loading. Please try again."
      );
      return;
    }

    const blockId =
      process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID;

    if (!blockId) {
      setMessage(
        "AdsGram Block ID is not configured."
      );
      return;
    }

    try {
      setAdLoading(true);
      setMessage("");

      // -----------------------------------------------------
      // CREATE SERVER-SIDE AD SESSION
      // -----------------------------------------------------

      const response = await fetch(
        "/api/ads/start",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
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

      if (!data.sessionId) {
        setMessage(
          "Ad session could not be created."
        );

        return;
      }

      setAdSession(data);

      // -----------------------------------------------------
      // INITIALIZE ADSGRAM
      // -----------------------------------------------------

      const AdController =
        window.Adsgram.init({
          blockId: String(blockId)
        });

      setMessage(
        "Advertisement শুরু হচ্ছে। পুরো বিজ্ঞাপনটি দেখুন।"
      );

      // -----------------------------------------------------
      // SHOW REWARDED AD
      // -----------------------------------------------------

      const result =
        await AdController.show();

      // -----------------------------------------------------
      // ADSGRAM COMPLETION CHECK
      // -----------------------------------------------------

      if (!result || result.done !== true) {
        setMessage(
          "Advertisement সম্পূর্ণ হয়নি। কোনো reward দেওয়া হয়নি।"
        );

        setAdSession(null);

        return;
      }

      // -----------------------------------------------------
      // AD COMPLETED
      // SEND TO SERVER
      // -----------------------------------------------------

      await completeAdReward(
        data.sessionId
      );

    } catch (err) {
      console.error(
        "ADSGRAM_ERROR",
        err
      );

      setAdSession(null);

      setMessage(
        "Advertisement skipped, unavailable, or could not be completed. No reward was added."
      );
    } finally {
      setAdLoading(false);
    }
  }

  // =========================================================
  // COMPLETE AD REWARD
  // =========================================================

  async function completeAdReward(sessionId) {
    if (!sessionId) {
      setMessage(
        "Ad session পাওয়া যায়নি।"
      );
      return;
    }

    if (!tg?.initData) {
      setMessage(
        "Telegram authentication data is missing."
      );
      return;
    }

    try {
      const response = await fetch(
        "/api/ads/complete",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            initData: tg.initData,
            sessionId: sessionId
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

      // -----------------------------------------------------
      // UPDATE BALANCE
      // -----------------------------------------------------

      setUser((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          balance:
            data.newBalance ??
            current.balance ??
            0,

          total_earned:
            Number(
              current.total_earned || 0
            ) +
            Number(data.reward || 0)
        };
      });

      // -----------------------------------------------------
      // SUCCESS
      // -----------------------------------------------------

      setMessage(
        `🎉 Ad verified! You earned $${Number(
          data.reward || 0
        ).toFixed(2)}`
      );

      setAdSession(null);

    } catch (err) {
      console.error(
        "COMPLETE_AD_ERROR",
        err
      );

      setMessage(
        "Advertisement verification failed."
      );
    }
  }

  // =========================================================
  // DAILY BONUS
  // =========================================================

  async function claimDailyBonus() {
    if (!tg?.initData) {
      setMessage(
        "Telegram authentication data is missing."
      );
      return;
    }

    try {
      setBonusLoading(true);
      setMessage("");

      const response = await fetch(
        "/api/bonus/daily",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
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
            "Unable to claim daily bonus."
        );

        return;
      }

      setUser((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,

          balance:
            data.newBalance ??
            current.balance ??
            0,

          total_earned:
            Number(
              current.total_earned || 0
            ) +
            Number(data.bonus || 0)
        };
      });

      setMessage(
        `🎁 Daily bonus claimed! You earned $${Number(
          data.bonus || 0
        ).toFixed(2)}`
      );

    } catch (err) {
      console.error(
        "DAILY_BONUS_ERROR",
        err
      );

      setMessage(
        "Unable to claim daily bonus."
      );

    } finally {
      setBonusLoading(false);
    }
  }

  // =========================================================
  // COMING SOON
  // =========================================================

  function comingSoon(name) {
    setMessage(
      `${name} feature is coming soon.`
    );
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <main className="page">

        <div className="loading">

          <div className="loader"></div>

          <h3>
            Loading...
          </h3>

          <p>
            Checking your account
          </p>

        </div>

      </main>
    );
  }

  // =========================================================
  // ERROR
  // =========================================================

  if (error) {
    return (
      <main className="page">

        <div className="errorCard">

          <div className="errorIcon">
            !
          </div>

          <h2>
            Something went wrong
          </h2>

          <p>
            {error}
          </p>

          <button
            className="primaryButton"
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

  // =========================================================
  // USER DATA
  // =========================================================

  const name =
    user?.first_name ||
    user?.username ||
    "User";

  const balance =
    Number(user?.balance || 0);

  // =========================================================
  // UI
  // =========================================================

  return (
    <main className="page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="topHeader">

        <div className="brand">

          <div className="brandIcon">
            A
          </div>

          <div>

            <div className="brandName">
              Ads Earn
            </div>

            <div className="brandSub">
              Earn • Watch • Withdraw
            </div>

          </div>

        </div>

        <button
          className="profileMini"
          onClick={() =>
            comingSoon("Profile")
          }
        >
          {name
            .charAt(0)
            .toUpperCase()}
        </button>

      </header>


      {/* =====================================================
          BALANCE
      ===================================================== */}

      <section className="balanceCard">

        <div className="balanceTop">

          <div>

            <span className="balanceLabel">
              Available Balance
            </span>

            <div className="balanceAmount">
              ${balance.toFixed(2)}
            </div>

          </div>

          <div className="walletIcon">
            $
          </div>

        </div>

        <div className="balanceBottom">

          <span>
            Total Earned
          </span>

          <strong>
            $
            {Number(
              user?.total_earned || 0
            ).toFixed(2)}
          </strong>

        </div>

      </section>


      {/* =====================================================
          USER CARD
      ===================================================== */}

      <section className="userCard">

        <div className="avatar">
          {name
            .charAt(0)
            .toUpperCase()}
        </div>

        <div className="userInfo">

          <strong>
            {name}
          </strong>

          <span>
            Telegram ID:{" "}
            {user?.telegram_id || "—"}
          </span>

        </div>

        <div className="verified">
          ✓
        </div>

      </section>


      {/* =====================================================
          MESSAGE
      ===================================================== */}

      {message && (
        <div className="message">
          {message}
        </div>
      )}


      {/* =====================================================
          ACTIVE AD STATUS
      ===================================================== */}

      {adSession && (
        <section className="activeAd">

          <div className="activeAdIcon">
            ▶
          </div>

          <div className="activeAdText">

            <strong>
              Advertisement Started
            </strong>

            <span>
              Watch the advertisement until
              the end to receive your reward.
            </span>

          </div>

          <div className="watchingBadge">
            Watching
          </div>

        </section>
      )}


      {/* =====================================================
          MENU
      ===================================================== */}

      <section className="menuGrid">


        {/* WATCH ADS */}

        <button
          className="menuCard featured"
          onClick={startAd}
          disabled={
            adLoading ||
            Boolean(adSession) ||
            !adsgramReady
          }
        >

          <div className="menuIcon">
            ▶
          </div>

          <strong>

            {adLoading
              ? "Showing Ad..."
              : !adsgramReady
              ? "Loading Ads..."
              : "Watch Ads"}

          </strong>

          <span>

            {adLoading
              ? "Please wait"
              : !adsgramReady
              ? "AdsGram loading"
              : "Watch full ad to earn"}

          </span>

        </button>


        {/* DAILY BONUS */}

        <button
          className="menuCard"
          onClick={claimDailyBonus}
          disabled={bonusLoading}
        >

          <div className="menuIcon">
            🎁
          </div>

          <strong>

            {bonusLoading
              ? "Claiming..."
              : "Daily Bonus"}

          </strong>

          <span>

            {bonusLoading
              ? "Please wait"
              : "Get $0.05 daily"}

          </span>

        </button>


        {/* REFER */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Refer & Earn")
          }
        >

          <div className="menuIcon">
            👥
          </div>

          <strong>
            Refer & Earn
          </strong>

          <span>
            Invite friends
          </span>

        </button>


        {/* PROFILE */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Profile")
          }
        >

          <div className="menuIcon">
            👤
          </div>

          <strong>
            Profile
          </strong>

          <span>
            My account
          </span>

        </button>


        {/* WITHDRAW */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Withdraw")
          }
        >

          <div className="menuIcon">
            💳
          </div>

          <strong>
            Withdraw
          </strong>

          <span>
            Get paid
          </span>

        </button>


        {/* HISTORY */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Earning History")
          }
        >

          <div className="menuIcon">
            📊
          </div>

          <strong>
            History
          </strong>

          <span>
            Your earnings
          </span>

        </button>


        {/* TOP USERS */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Top Users")
          }
        >

          <div className="menuIcon">
            🏆
          </div>

          <strong>
            Top Users
          </strong>

          <span>
            Leaderboard
          </span>

        </button>


        {/* CHANNEL */}

        <button
          className="menuCard"
          onClick={() => {

            if (
              tg?.openTelegramLink
            ) {
              tg.openTelegramLink(
                "https://t.me/AdsEarnbot6"
              );
            }

          }}
        >

          <div className="menuIcon">
            📢
          </div>

          <strong>
            Channel
          </strong>

          <span>
            Join channel
          </span>

        </button>


        {/* SUPPORT */}

        <button
          className="menuCard"
          onClick={() =>
            comingSoon("Support")
          }
        >

          <div className="menuIcon">
            🎧
          </div>

          <strong>
            Support
          </strong>

          <span>
            Get help
          </span>

        </button>

      </section>


      {/* =====================================================
          BOTTOM NAV
      ===================================================== */}

      <nav className="bottomNav">

        <button className="navItem active">

          <span>
            ⌂
          </span>

          <small>
            Home
          </small>

        </button>


        <button
          className="navItem"
          onClick={() =>
            comingSoon("Tasks")
          }
        >

          <span>
            ✓
          </span>

          <small>
            Tasks
          </small>

        </button>


        <button
          className="navItem"
          onClick={() =>
            comingSoon("Top Users")
          }
        >

          <span>
            🏆
          </span>

          <small>
            Top
          </small>

        </button>


        <button
          className="navItem"
          onClick={() =>
            comingSoon("Support")
          }
        >

          <span>
            🎧
          </span>

          <small>
            Support
          </small>

        </button>


        <button
          className="navItem"
          onClick={() =>
            comingSoon("Withdraw")
          }
        >

          <span>
            💳
          </span>

          <small>
            Withdraw
          </small>

        </button>

      </nav>


      <div className="bottomSpace"></div>


      {/* =====================================================
          CSS
      ===================================================== */}

      <style jsx>{`

        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: #f5f7fb;
          color: #172033;
          font-family: Arial, Helvetica, sans-serif;
          padding: 0 14px 20px;
        }

        .topHeader {
          margin: 0 -14px;
          padding: 18px;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .brandIcon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: rgba(255,255,255,.18);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 800;
        }

        .brandName {
          font-size: 21px;
          font-weight: 800;
        }

        .brandSub {
          font-size: 11px;
          opacity: .8;
          margin-top: 2px;
        }

        .profileMini {
          width: 42px;
          height: 42px;
          border: 2px solid rgba(255,255,255,.6);
          border-radius: 50%;
          background: rgba(255,255,255,.18);
          color: white;
          font-size: 18px;
          font-weight: 800;
        }

        .balanceCard {
          margin-top: 16px;
          padding: 20px;
          border-radius: 22px;
          background: #2864e8;
          color: white;
          box-shadow: 0 10px 28px rgba(40,100,232,.22);
        }

        .balanceTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .balanceLabel {
          display: block;
          font-size: 13px;
          opacity: .85;
        }

        .balanceAmount {
          margin-top: 5px;
          font-size: 35px;
          font-weight: 800;
        }

        .walletIcon {
          width: 54px;
          height: 54px;
          border-radius: 17px;
          background: rgba(255,255,255,.16);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 27px;
          font-weight: 800;
        }

        .balanceBottom {
          border-top: 1px solid rgba(255,255,255,.22);
          margin-top: 18px;
          padding-top: 13px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .userCard {
          background: white;
          margin-top: -2px;
          border-radius: 18px;
          padding: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 6px 20px rgba(0,0,0,.07);
          border: 1px solid #e6ebf5;
        }

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 21px;
          font-weight: 800;
        }

        .userInfo {
          flex: 1;
          min-width: 0;
        }

        .userInfo strong {
          display: block;
          font-size: 16px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .userInfo span {
          display: block;
          margin-top: 4px;
          color: #7b8495;
          font-size: 11px;
        }

        .verified {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }

        .message {
          margin-top: 12px;
          padding: 11px 13px;
          border-radius: 12px;
          background: white;
          border: 1px solid #e0e5ef;
          text-align: center;
          font-size: 13px;
        }

        .activeAd {
          margin-top: 13px;
          background: white;
          border: 1px solid #dce4f3;
          border-radius: 17px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 5px 15px rgba(0,0,0,.05);
        }

        .activeAdIcon {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 12px;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .activeAdText {
          flex: 1;
          min-width: 0;
        }

        .activeAdText strong {
          display: block;
          font-size: 13px;
        }

        .activeAdText span {
          display: block;
          color: #7c8492;
          font-size: 11px;
          margin-top: 3px;
        }

        .watchingBadge {
          background: #e8f0ff;
          color: #2864e8;
          border-radius: 9px;
          padding: 7px 9px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .menuGrid {
          margin-top: 17px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .menuCard {
          min-height: 137px;
          padding: 13px 7px;
          border: 1px solid #dce5f4;
          border-radius: 19px;
          background: white;
          box-shadow: 0 4px 12px rgba(20,50,100,.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform .15s;
        }

        .menuCard:active {
          transform: scale(.96);
        }

        .menuCard.featured {
          border-color: #b9d0ff;
          background: #fafdff;
        }

        .menuCard:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .menuIcon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 23px;
          margin-bottom: 9px;
        }

        .menuCard strong {
          font-size: 13px;
          color: #2057d4;
          text-align: center;
        }

        .menuCard span {
          margin-top: 4px;
          font-size: 10px;
          color: #8a93a3;
          text-align: center;
        }

        .bottomNav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 70px;
          background: rgba(255,255,255,.97);
          border-top: 1px solid #e3e7ee;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          z-index: 50;
          box-shadow: 0 -5px 20px rgba(0,0,0,.06);
        }

        .navItem {
          border: 0;
          background: transparent;
          color: #9ba4b3;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 20px;
        }

        .navItem small {
          font-size: 10px;
          font-weight: 700;
        }

        .navItem.active {
          color: #2864e8;
        }

        .bottomSpace {
          height: 75px;
        }

        .loading,
        .errorCard {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .loading p,
        .errorCard p {
          color: #7b8494;
          font-size: 13px;
        }

        .loader {
          width: 42px;
          height: 42px;
          border: 4px solid #dce6fb;
          border-top-color: #2864e8;
          border-radius: 50%;
          animation: spin .8s linear infinite;
          margin-bottom: 10px;
        }

        .errorIcon {
          width: 55px;
          height: 55px;
          border-radius: 50%;
          background: #2864e8;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 800;
        }

        .primaryButton {
          margin-top: 12px;
          border: 0;
          border-radius: 12px;
          background: #2864e8;
          color: white;
          padding: 13px 25px;
          font-weight: 700;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 360px) {

          .menuGrid {
            gap: 7px;
          }

          .menuCard {
            min-height: 128px;
          }

          .menuIcon {
            width: 47px;
            height: 47px;
          }

          .menuCard strong {
            font-size: 12px;
          }

        }

      `}</style>

    </main>
  );
}
