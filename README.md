# 0FluffCook 🔪🔥

**No Ads. No Life Stories. Just Food.**

A lightweight, privacy-focused utility that extracts ingredients and steps from messy text or URLs, converting them into clean, savable recipe cards. Powered by Google Gemini.

**[🔗 Open the Web App](https://Raw-JSON.github.io/0FluffCook/)**

---

## ✅ V3.5 Stable Release: Surgical Extraction Fix

This release introduces a **surgical fix** for the main extraction feature. We replaced unreliable string manipulation with a native browser **DOMParser** strategy, ensuring the AI receives clean, noise-free input, making URL extraction highly reliable.

## 🚀 Core Features

* **100% Client-Side:** Zero servers, zero user tracking. All data is saved securely in your browser's local storage.
* **PWA Ready:** Install the app to your desktop or mobile home screen for an instant-loading, offline-capable experience.
* **AI Smart Parse:** Uses Gemini 2.5 Flash to intelligently filter noise, format measurements, and structure messy text/URLs into clean JSON.
* **Full Data Control:** Features include Favorites, Manual Editor, and full Backup/Restore functionality (JSON export).
* **OLED Aesthetic:** Built with a sleek, dark-mode focused UI.

## 🔑 Setup (Bring Your Own Key)

0FluffCook requires a free API key from Google Gemini to perform extractions.

1.  Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  Create your API Key.
3.  Open 0FluffCook, click the **Gear ⚙️**, and paste your key.

## 📄 License
MIT License. Open source and free forever.
