import express, { Router } from 'express';
import serverless from 'serverless-http';
import fetch from 'node-fetch';

const app = express();
const router = Router();

// Middleware to parse JSON bodies from the frontend
app.use(express.json());

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzqYTJ9TpC3_HQtvgr16XMTfivBYLQc_qT_N6rtcMj_fhjroLvSBdAQMrz6zGDSPHnq/exec';

// Generic proxy endpoint to forward requests to the Google Apps Script
router.post('/sheets-proxy', async (req, res) => {
  // The frontend will send a body like { action: 'getTransactions', userId: '123' }
  // We forward this entire body to the Apps Script.
  const requestBody = req.body;

  if (!requestBody || !requestBody.action) {
    return res.status(400).json({ success: false, error: 'An "action" must be specified in the request body.' });
  }

  try {
    // Replicate the fetch logic from the original sheetApi.ts
    const scriptResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-t'
      },
      body: JSON.stringify(requestBody),
    });

    if (!scriptResponse.ok) {
      // Forward the HTTP error status from the Apps Script
      return res.status(scriptResponse.status).json({
        success: false,
        error: `Google Apps Script responded with status: ${scriptResponse.status}`
      });
    }

    const responseText = await scriptResponse.text();
    let responseData;

    try {
      // The Apps Script should return JSON, so we parse it
      responseData = JSON.parse(responseText);
    } catch (e) {
      // If parsing fails, it might be an HTML error page from Google
      console.error("Failed to parse JSON from Apps Script. Response text:", responseText.substring(0, 500));
      return res.status(500).json({ success: false, error: "Invalid response from Google Apps Script. It may have returned an error page instead of JSON." });
    }
    
    // Send the data from the Apps Script back to our frontend
    res.status(200).json(responseData);

  } catch (error) {
    console.error('Error proxying to Google Apps Script:', error);
    res.status(500).json({ success: false, error: 'Failed to communicate with the Google Apps Script.' });
  }
});

// The base path is handled by the Netlify redirect.
// Requests to /api/* will be routed here.
app.use('/', router);

export const handler = serverless(app);