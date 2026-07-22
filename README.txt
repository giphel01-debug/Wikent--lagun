WIKENT @ LAGUN, real deployable site
======================================

What's in this folder
----------------------
index.html          The public site, listings, apartment pages, booking form
owner/index.html     The owner panel, real login required
assets/config.js     Connects both pages to your live Supabase database
assets/style.css     Shared styling
assets/app.js        Public site logic
owner/owner.js        Owner panel logic

This is already wired to your real, live Supabase project (yawrmcqnzxyjfakabpfs),
same database the SQL schema was applied to earlier. The three real listings,
amenities, and everything else already in there will show up as soon as this
goes live.


STEP 1: Create your owner login
--------------------------------
This is the one thing I can't do for you. In the Supabase dashboard:

1. Go to supabase.com/dashboard, open the Wikent Lagun project.
2. In the left sidebar, go to Authentication > Users.
3. Click "Add user" > "Create new user".
4. Enter your email and a password. Leave "Auto confirm user" checked.
5. Save.

That email and password are what you'll log in with at owner/index.html.
No one else can create an account from the site itself, there's no public
sign up form, this is intentional.


STEP 2: Put it online
-----------------------
This is a static site, plain HTML, CSS, and JavaScript, no build step, no
server required. Any of these work, pick whichever feels easiest:

Option A, Netlify (probably the simplest)
1. Go to netlify.com, sign up free.
2. Drag this whole folder onto the page where it says "Deploy manually" /
   "drag and drop your site folder here".
3. It gives you a live URL in seconds, something like
   random-name-123.netlify.app. You can rename it or connect a real
   domain from there later.

Option B, Vercel
1. Go to vercel.com, sign up free.
2. Use "Add New Project" > "Deploy" and upload this folder, or connect it
   through a GitHub repository if you'd rather manage it with git.

Option C, your own hosting (Hostinger, etc.)
Just upload this whole folder as is via FTP or their file manager, no
special configuration needed.


STEP 3: Point your real domain at it
--------------------------------------
Once you've picked a domain (something like wikentlagun.com), whichever
host you chose above will have a "custom domain" section where you add it
and follow their DNS instructions.


STEP 4: Update the Google Maps API key restriction
------------------------------------------------------
Remember the key you set up, currently restricted to localhost for
testing. Once your real domain is live, go back to Google Cloud Console
> APIs & Services > Credentials, edit the key, and add your real domain
to the allowed websites list, then remove localhost if you don't need it
anymore.


A few honest notes
--------------------
- Distance and time callouts (like "6 minutes to Playa Lagun") aren't
  built into this version yet, the Maps key is saved and ready, but that
  feature needs its own pass of work.
- Calendar sync to Google or Microsoft calendar isn't built yet either,
  that needs a real login flow with those providers.
- Photo and video upload isn't wired in yet. Right now, if an apartment's
  apartment_photos or apartment_videos table has rows with real image
  URLs, they'll display, but there's no upload button in the owner panel
  yet to add them yourself. Worth doing as the next real piece of work.
- The insights view (views and leads by apartment) also didn't make it
  into this pass, everything else did.

Everything else from the plan is real and working: four languages,
XCG and USD pricing, the weekend package pricing structure, amenities as
a managed list, the request to book and notify me flows, manual
reservations, confirm check in, check in and check out reminders, and
the arrival message generator.
