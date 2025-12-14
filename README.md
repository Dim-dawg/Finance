
# 🐶 Dim Dawg AI Financial Analyzer

**Tech Business Edition: Secure. Local. Intelligent.**

Dim Dawg is a premium, privacy-focused financial dashboard purpose-built for **Technology Services Companies** (Agencies, SaaS, Consultancies). It runs entirely in your browser using **Google Gemini** models to parse bank statements, categorize tech-spend, and model your Burn Rate and Runway.

It follows a **Local-First** architecture (your data lives in `localStorage`), with an optional **Google Sheets Backend** for cross-device sync.

---

## 🚀 Key Features

### 🧠 Intelligent Tech Finance Core
- **📄 Smart Parsing (Gemini 2.5 Flash):** Drag & drop PDF statements or CSVs. The AI detects business categories like Cloud Infrastructure (AWS), SaaS Subscriptions, and Contractor Payouts.
- **💬 Tech CFO Assistant:** An always-available chat assistant. Ask *"What is my current burn rate?"*, *"Can I afford to hire another contractor?"*, or *"How much runway do we have?"*
- **🔮 Runway Forecast (Gemini 3 Pro):** A dedicated Cash Flow modeling engine. It combines your **Historical OpEx** with **Known Recurring Revenue (MRR)** to generate realistic 6-month runway projections.

### 🏛️ Business Balance Sheet
- **🕰️ Time Travel:** View your Company Equity snapshot as of today, or travel back to see what it looked like at the end of previous fiscal years.
- **🔗 Dynamic Grounding:** Link Liabilities (e.g. Venture Debt) to transaction categories to auto-update values as you make payments.
- **💰 Asset Tracking:** Track Cash, Accounts Receivable, and IP value alongside automated cash flow.

### ⚡ Automation & Control
- **⚡ Rules Engine:** Create custom "If this, then that" rules (e.g., "Upwork" → "Contractor Fees").
- **🪄 Magic Wand:** Instantly create categorization rules from transaction rows.
- **📅 Recurring Manager:** Auto-detect SaaS subscriptions and Payroll patterns to harden your forecasts.

### 📊 Visualization & Data
- **📈 Operating Dashboard:** Revenue vs. OpEx bars, Category breakdown (Software vs Admin vs Personnel), and Net Cash Flow.
- **📉 P&L Reports:** Generate printable Profit & Loss statements for tax preparation.
- **🔒 Local-First Privacy:** Data is stored in your browser by default. It never leaves your device unless you explicitly sync to your own Google Sheet.

---

## 📱 Page Guide

Detailed breakdown of the application views:

- **📊 Dashboard:** Your command center. Visualizes Revenue, OpEx, and Net Cash Flow.
- **📝 Transactions:** The general ledger. Search, filter, edit, and categorize every operational transaction.
- **📈 Profit & Loss:** A professional-grade P&L statement. View your Net Operating Income and Margins for any fiscal year.
- **🏛️ Balance Sheet:** Track Business Assets (Cash, AR) and Liabilities (Loans, AP).
- **🔮 Forecast:** The Runway engine. Generates a 6-month burn rate analysis. Includes a "Scenario Simulator" to test the impact of hiring or purchasing new tools.
- **⚡ Rules:** Automate categorization for recurring vendors.
- **⚙️ Settings:** Connect to the Google Sheets backend, manage API keys for external integrations, and handle data resets.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Tailwind CSS, Lucide Icons
- **AI Integration:** Google GenAI SDK (`gemini-2.5-flash`, `gemini-3-pro-preview`)
- **State Management:** React Context + LocalStorage Persistence
- **Visualization:** Recharts
- **Backend (Optional):** Google Apps Script + Google Sheets

---

## ☁️ Google Sheets Backend (Sync)

The backend utilizes **Google Apps Script** to turn a standard spreadsheet into a JSON API.

### 1. Automatic Schema Creation
You **do not** need to manually create columns. When the app syncs for the first time, it automatically creates the necessary tabs (`Users`, `Transactions`, `Rules`, `Recurring`, `ApiKeys`) with the correct headers.

### 2. Database Schema

**Tab: `Transactions`**
| Column | Description |
| :--- | :--- |
| `transaction_id` | Unique UUID. |
| `user_id` | Links data to the user. |
| `date` | YYYY-MM-DD format. |
| `description` | Vendor name. |
| `amount` | Transaction value. |
| `category` | Assigned category. |
| `type` | `income` or `expense`. |

### 3. API & Security
The Apps Script acts as a router that accepts `POST` requests containing a JSON payload. It uses a `text/plain` content type workaround to bypass CORS restrictions standard to Google Web Apps.

---

## ⚙️ Setup Guide

### 1. Get a Gemini API Key
You need an API key to enable the AI features.
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Create an API key.
3. Keep it safe (add it to `.env` or inject via environment variables).

### 2. Frontend Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory:
   ```env
   API_KEY=your_google_gemini_api_key_here
   ```
4. Start the development server:
   ```bash
   npm start
   ```

### 3. Backend Deployment (Optional)
1. **Create a Sheet:** Go to Google Sheets, create a blank sheet.
2. **Add Code:** Extensions > Apps Script. Paste the provided `Code.gs` (found in `App.tsx` or the settings panel).
3. **Deploy:** 
   - Click **Deploy** > **New deployment**.
   - Type: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** (Required for the API to be accessible by the app).
4. **Connect:** Copy the Web App URL and paste it into the Dim Dawg **Settings** page.

---

## ⚠️ Privacy Note
When parsing PDFs or generating forecasts, data snippets are sent to Google Gemini for processing. This data is **transient** and is not used to train models. Your financial data is otherwise stored strictly on your device or your private Google Sheet.
