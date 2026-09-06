---
sidebar_position: 1
---

# Privacy Policy

**Effective date:** September 2026

Athlora ("we", "us", "our") is an athletics coaching web application. This privacy policy explains what personal data we collect, how we use it, and your rights.

## Data we collect

### Account information

When you create an account, Auth0 (our authentication provider) collects your email address and password. We receive and store your name, email address, and a unique identifier from Auth0. We do not store passwords.

### Athlete data

As a coach, you enter information about the athletes you manage. This includes:

- **Profile data:** name, date of birth, gender, squad assignment, and notes
- **Performance data:** 100m times, event results, personal bests, and season bests
- **Health data:** injury records including body region, area, side, severity, occurrence date, expected return date, resolution date, and notes

You are responsible for obtaining any necessary consent from athletes (or their parents/guardians) before entering their data into Athlora.

### Event and competition data

- Event details (title, date, time, venue, type)
- Participant assignments and RSVP status
- Timeline entries (finishes, incidents, notes)
- Derived results, placings, and manual overrides

### Usage data

- **Local storage:** We store your authentication token, active workspace selection, and theme preferences in your browser's local storage.
- **Session storage:** We temporarily cache geolocation coordinates (for weather display) and public logger session data.
- **IndexedDB:** When offline, we store queued actions and cached event data in your browser's IndexedDB for offline access.
- **Service worker:** We cache app shell files and API responses for offline functionality.

### Voice data

If you use the AI voice assistant, your microphone audio is streamed directly from your browser to Google's Gemini servers. We do not store, record, or have access to your voice data. The voice assistant helps you add athletes by voice command.

## How we use your data

- To provide and maintain the Athlora coaching platform
- To authenticate your account and manage access
- To derive performance statistics, personal bests, and season bests from your logged data
- To enable offline functionality when you have no internet connection
- To display weather data for your event venues (using your device's geolocation)

## Third-party services

| Service | Purpose | Data shared |
|---------|---------|-------------|
| **Auth0** | Authentication | Email, name (handled under Auth0's privacy policy) |
| **Google Gemini** | AI voice assistant | Microphone audio (direct browser-to-Gemini, not routed through our servers) |
| **Open-Meteo** | Weather forecasts | Geographic coordinates only (no personal data) |
| **Nominatim/OSM** | Venue search | Search query text only (no personal data) |
| **Neon** | Database hosting | All application data (hosted in EU, Frankfurt) |
| **Vercel** | Frontend hosting | No personal data stored (static files only) |
| **Render** | Backend hosting | API requests (processed, not stored beyond logs) |
| **Cloudflare** | Docs site hosting | No personal data |

## Data storage and security

- All data is stored in PostgreSQL on Neon, hosted in the European Union (Frankfurt, Germany).
- Database connections are encrypted (SSL required).
- Your authentication is handled by Auth0, which stores your password securely. We never see or store your password.
- We use HTTPS for all communication between your browser and our servers.

## Data retention

- **Active accounts:** Your data is retained as long as your account is active.
- **Account deletion:** When you delete your account, we remove your workspace access and send a deletion request to Auth0. Your name and email are retained in our database for audit purposes (to preserve attribution on records you created). All athlete data, events, results, and other records remain in the database with your attribution.
- **Offline data:** Data stored in your browser's IndexedDB and service worker cache is cleared when you sign out or when you clear your browser data.

## Your rights

- **Access:** You can view all your data through the Athlora interface.
- **Correction:** You can edit your profile and athlete data at any time.
- **Deletion:** You can request account deletion from the Account settings page. This will remove your access and deactivate your Auth0 identity.
- **Export:** Your data is available through the Athlora API while your account is active.

## Children's privacy

Athlora is designed for athletics coaches, not for direct use by minors. If you are a coach entering data about athletes who are minors, you are responsible for obtaining any required parental or guardian consent under applicable law.

## Changes to this policy

We may update this privacy policy from time to time. If we make material changes, we will notify you through the application. The effective date at the top of this page indicates when this policy was last updated.

## Contact

For questions about this privacy policy, please contact us through the Athlora application.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
