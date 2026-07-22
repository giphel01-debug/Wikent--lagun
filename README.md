# Wikent @ Lagun

A weekend house booking platform for three vacation rentals in the Lagun area of Curaçao. Real time availability, flexible date booking, a full owner management panel, and automated notifications, built as a real deployed system rather than a static template.

**Live site:** https://lagunwikenthuis.com

## What this is

The property owner was managing three rental houses entirely through WhatsApp, no way to see what was actually booked, easy to accidentally double book, no record of who had asked about what. This project replaces that with a real booking and property management platform: a public site guests actually browse and book from, and a private dashboard the owner uses to run the business day to day.

## Features

### Public site
- Live listings pulled from a real database, not hardcoded content
- Interactive availability calendar per listing, plus a combined view on the homepage
- Flexible booking, any check in and check out date, not locked to a fixed weekend pattern
- Dynamic pricing, a weekend package rate plus a per night rate for any other length of stay
- Photo and video galleries with a full screen lightbox
- "Notify me" requests on dates that are already booked
- One tap WhatsApp contact, pre filled with the booking details
- Fully responsive, mobile first design

### Owner panel
- Real authentication, no public sign up
- Full editing for every apartment: pricing, amenities, bed and bathroom counts, cancellation policy, arrival instructions
- Photo and video management: upload, reorder, and replace files without losing their position
- A shared amenities list managed once, used across every listing
- Manual reservation entry, including logging bookings that happened before this system existed
- Automatic check in and check out reminders, with a ready made arrival message generator
- Lead management, convert a request straight into a confirmed reservation with one tap
- A basic insights view, page views and leads by listing
- One click backup and restore of the entire database to a local file

### Automation
- Email alert the moment a request comes in, with a direct link back into the owner panel to that exact request
- A WhatsApp message pre filled and ready to send after a guest submits a request

## Tech stack

- Vanilla HTML, CSS, and JavaScript, no framework, no build step
- [Supabase](https://supabase.com) for the Postgres database, authentication, storage, and edge functions
- [Resend](https://resend.com) for transactional email
- Deployed on [Netlify](https://netlify.com)

## Project structure

```
wikent-lagun-site/
├── index.html          # Public site
├── owner/
│   ├── index.html      # Owner panel, requires login
│   └── owner.js
├── assets/
│   ├── app.js           # Public site logic
│   ├── config.js        # Shared Supabase connection and helpers
│   ├── style.css
│   └── favicon and logo assets
└── README.md
```

## Running this yourself

This is a static site with no build step.

1. Create a [Supabase](https://supabase.com) project.
2. Set up the schema: tables for apartments, amenities, reservations, leads, and site settings, with row level security enabled so only an authenticated owner can write.
3. Update `assets/config.js` with your own project URL and anon key. The anon key is meant to be public, it's the row level security policies that actually control access, not keeping this key secret.
4. Create an owner account under Supabase Authentication.
5. Deploy the folder to any static host, no build configuration needed.

## Notes

Built as a real client project, not a demo. Running costs stay under $20 a year at this scale, domain registration being the only real recurring cost.
