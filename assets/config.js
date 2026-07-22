// Wikent @ Lagun, shared Supabase connection
// This anon key is meant to be public, it's restricted by Row Level Security
// policies on the database side, not by keeping it secret.

const SUPABASE_URL = "https://yawrmcqnzxyjfakabpfs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlhd3JtY3Fuenh5amZha2FicGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTQ2MTIsImV4cCI6MjA5OTA5MDYxMn0.dDKuzzsXCpu5Huqvb3R_qDU9YU3-g4A0HtocMUlmALI";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pap", label: "Papiamentu" },
  { code: "nl", label: "Nederlands" },
  { code: "es", label: "Español" }
];

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function sortByOrder(arr) {
  return [...(arr || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nightsList(checkIn, checkOut) {
  const nights = [];
  let d = checkIn;
  while (d < checkOut) {
    nights.push(d);
    d = addDays(d, 1);
  }
  return nights;
}

function calculatePrice(apt, checkIn, checkOut) {
  const nights = nightsList(checkIn, checkOut);
  let weekendPairFound = false;
  for (let i = 0; i < nights.length; i++) {
    const dow = new Date(nights[i] + "T00:00:00").getDay();
    if (dow === 5 && nights[i + 1] && new Date(nights[i + 1] + "T00:00:00").getDay() === 6) {
      weekendPairFound = true;
      break;
    }
  }
  if (weekendPairFound) {
    const extraNights = nights.length - 2;
    return Number(apt.weekend_price) + extraNights * Number(apt.extra_day_price);
  }
  return nights.length * Number(apt.extra_day_price);
}
