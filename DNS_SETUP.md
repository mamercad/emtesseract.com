# emTesseract DNS Setup Instructions

## GitHub Pages is Ready! ✅

Your site is built and deployed at: https://mamercad.github.io/emtesseract.com

Now let's point your domain to it.

---

## Part 1: NameCheap DNS Configuration

### Step 1: Log into NameCheap
1. Go to https://namecheap.com
2. Sign in
3. Go to "Domain List"
4. Click "Manage" next to `emtesseract.com`

### Step 2: Configure DNS Records

Click on "Advanced DNS" tab and add these records:

#### A Records (for apex domain)
**Type** | **Host** | **Value** | **TTL**
---------|----------|-----------|--------
A Record | @ | 185.199.108.153 | Automatic
A Record | @ | 185.199.109.153 | Automatic
A Record | @ | 185.199.110.153 | Automatic
A Record | @ | 185.199.111.153 | Automatic

#### CNAME Record (for www subdomain)
**Type** | **Host** | **Value** | **TTL**
---------|----------|-----------|--------
CNAME Record | www | mamercad.github.io. | Automatic

### Step 3: Save Changes
- Click "Save All Changes"
- DNS propagation can take 5-60 minutes (sometimes up to 24 hours)

---

## Part 2: Email Setup (root@emtesseract.com)

You have a few options:

### Option A: NameCheap Email Forwarding (Free & Simple)
1. In NameCheap dashboard, go to "Domain List"
2. Click "Manage" next to `emtesseract.com`
3. Click "Redirect Email" or "Email Forwarding"
4. Add forwarding rule:
   - **Alias**: `root`
   - **Forward to**: your existing email (e.g., `mamercad@gmail.com`)

**Pros:** Free, simple, no setup
**Cons:** Can't send FROM root@emtesseract.com

### Option B: Google Workspace (Paid, Full Features)
1. Sign up: https://workspace.google.com/
2. Verify domain ownership
3. Configure MX records (Google provides these)
4. ~$6/user/month

**Pros:** Full Gmail experience, can send/receive
**Cons:** Costs money

### Option C: Cloudflare Email Routing (Free, Recommended!)
1. Transfer DNS to Cloudflare (or just use their email routing)
2. Set up free email forwarding
3. Can use "Email Workers" to send too (advanced)

**Pros:** Free, powerful, better than NameCheap forwarding
**Cons:** Requires Cloudflare account

---

## Part 3: Verify Everything Works

### Check DNS Propagation
```bash
# Check A records
dig emtesseract.com +short

# Check CNAME
dig www.emtesseract.com +short

# Check from multiple locations
https://www.whatsmydns.net/#A/emtesseract.com
```

### Check HTTPS
Once DNS propagates:
1. Go to https://github.com/mamercad/emtesseract.com/settings/pages
2. Under "Custom domain", verify `emtesseract.com` shows ✅
3. Check "Enforce HTTPS" (may take a few minutes to become available)

---

## Current Status

✅ GitHub Pages site built and deployed  
✅ CNAME file added to repository  
⏳ Awaiting DNS configuration at NameCheap  
⏳ Awaiting email setup  

**Next Steps:**
1. Configure DNS records at NameCheap (instructions above)
2. Choose and set up email option
3. Wait for DNS propagation
4. Enable HTTPS on GitHub Pages
5. Share your new site! 🎮

---

## Need Help?

- GitHub Pages DNS docs: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
- NameCheap DNS guide: https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-an-a-address-record-for-my-domain/

Questions? Just ask!
