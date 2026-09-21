"use client";
import { useState, useEffect } from "react";

export default function HomeDashboard() {
  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // এখানে আপনার ইউজারের ডেটা লোড করার লজিক থাকবে
    const fetchedUser = {
      telegram_id: 8571575227,
      username: "Ytyt",
      balance: 0.33,
      total_earned: 0.33,
      referralLevel1: [],
      referralLevel2: [],
      referralLevel3: []
    };
    setUser(fetchedUser);
    setLoading(false);
  }, []);

  const botUsername = "AdsEarn13_bot"; 
  const referralLink = user ? `https://t.me/${botUsername}?start=${user.telegram_id}` : "";

  const copyToClipboard = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-4 max-w-md mx-auto bg-gray-50 min-h-screen pb-20">
      {/* ব্যালেন্স কার্ড */}
      <div className="bg-blue-600 text-white p-5 rounded-2xl shadow-md mb-4">
        <p className="text-xs text-blue-100 uppercase tracking-wider">Total Earned</p>
        <h2 className="text-2xl font-bold mb-3">${user?.total_earned || "0.00"}</h2>
        
        <div className="flex items-center justify-between bg-blue-700/50 p-3 rounded-xl">
          <div>
            <p className="text-xs text-blue-200">Telegram ID</p>
            <p className="font-semibold text-sm">{user?.username} ({user?.telegram_id})</p>
          </div>
          <span className="bg-white/20 p-2 rounded-full">✓</span>
        </div>
      </div>

      {/* রেফার অ্যান্ড আর্ন সেকশন */}
      <div className="bg-white p-4 rounded-2xl shadow-sm mb-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800 text-base">Refer & Earn</h3>
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">
            Level 1, 2, 3
          </span>
        </div>
        
        <p className="text-gray-500 text-xs mb-3">
          Invite friends using your link and earn automatic team commissions when they withdraw!
        </p>

        <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-200 mb-3">
          <input 
            type="text" 
            value={referralLink} 
            readOnly 
            className="bg-transparent w-full text-xs outline-none text-gray-600 select-all"
          />
          <button 
            onClick={copyToClipboard}
            className="ml-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* টিম বা রেফারেল স্ট্যাটিস্টিক্স লেভেল ১, ২, ৩ */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
            <p className="text-[10px] text-gray-500 font-medium">Level 1</p>
            <p className="font-bold text-blue-600 text-sm">{user?.referralLevel1?.length || 0}</p>
          </div>
          <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
            <p className="text-[10px] text-gray-500 font-medium">Level 2</p>
            <p className="font-bold text-blue-600 text-sm">{user?.referralLevel2?.length || 0}</p>
          </div>
          <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
            <p className="text-[10px] text-gray-500 font-medium">Level 3</p>
            <p className="font-bold text-blue-600 text-sm">{user?.referralLevel3?.length || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
