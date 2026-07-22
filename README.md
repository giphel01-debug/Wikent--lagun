# Wikent @ Lagun

A weekend house booking platform for three vacation rentals in the Lagun area of Curaçao. Real time availability, flexible date booking, a full owner management panel, and automated notifications, built as a real deployed system rather than a static template.

**Live site:** https://lagunwikenthuis.com



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





