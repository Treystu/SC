# Sharing Your SC App - User Guide

Welcome to Sovereign Communications! This guide will help you share the app with friends and family using our multiple sharing methods.

## Quick Start

### Method 1: QR Code Sharing (Recommended) 📱

**Best for**: In-person sharing, quick setup

1. Click the **"Share App"** button in your conversation list
2. A QR code will appear on your screen
3. Have your friend open their camera app
4. Point the camera at the QR code
5. Tap the notification/link that appears
6. They'll be taken to the install page
7. Click **"Install & Join"** to install the app
8. You'll be automatically connected!

**Tips:**
- Works with any smartphone camera
- No typing required
- Instant connection
- Download QR as PNG to share digitally

---

### Method 2: Web Share (Native Sharing) 📤

**Best for**: Sharing via messaging apps, email, social media

1. Click the **"Share App"** button
2. Click the **"📤 Share"** button in the modal
3. Your device's native share menu will open
4. Choose how to share:
   - WhatsApp, Signal, Telegram
   - Email
   - Messages/SMS
   - Copy link
5. Your friend receives the link
6. They click it and install the app
7. Automatic connection!

**Tips:**
- Works on all iOS and Android devices
- Familiar sharing experience
- Choose any app to share through
- Link is safe and secure

---

### Method 3: Copy & Send Link 📋

**Best for**: Manual sharing, pasting into forms

1. Click the **"Share App"** button
2. Click the **"📋 Copy"** button next to the URL
3. Paste the link anywhere:
   - Text message
   - Email
   - Social media DM
   - Forum post
4. Friend clicks link
5. Install and connect!

**Tips:**
- Universal compatibility
- Paste anywhere
- Simple and reliable

---

### Method 4: Local Network Sharing 🌐

**Best for**: No internet connection, same WiFi network

1. Click the **"Share App"** button
2. Click **"🌐 Share on Local Network"**
3. App discovers your local IP addresses
4. Multiple URLs will appear (e.g., `http://192.168.1.100/join#...`)
5. Share any of these URLs with friends on the same WiFi
6. No internet connection needed!

**Requirements:**
- Both devices on same WiFi network
- Works great for:
  - Airplane mode (with WiFi)
  - No cellular connection
  - Offline events
  - Privacy-conscious users

**Tips:**
- Multiple URLs shown for different network interfaces
- Click 📋 to copy individual URLs
- QR codes can be generated for each URL
- Completely local - no server needed

---

## What Your Friend Sees

When your friend receives an invite, they'll see a beautiful landing page with:

- **Your name** (if you've set it)
- **Invitation message**: "You've been invited to join Sovereign Communications"
- **Install button**: One-click PWA installation
- **Browser fallback**: Open in browser if installation not wanted
- **Feature highlights**:
  - 🔒 End-to-end encrypted messaging
  - 🌐 Decentralized mesh network
  - 🚫 No central servers or tracking
  - 📱 Works on Web, Android & iOS

### Installation Process

1. **Click "Install & Join"**
   - Browser shows installation prompt
   - "Add to Home Screen" or "Install App"
   
2. **Accept installation**
   - App installs in 1-2 seconds
   - Icon added to home screen/app drawer
   
3. **App opens automatically**
   - Your invite is already loaded
   - Instant connection to you
   - Ready to start chatting!

**Alternative**: Click "Open in Browser" to use without installing

---

## Invite Details

Every invite you create includes:

- **Unique code**: 64-character secure identifier
- **Your name**: So friends know who invited them
- **Expiration**: Invites expire after 7 days (default)
- **One-time use**: Each invite can be used once
- **Signature**: Cryptographically signed for security

### Managing Invites

- Invites are automatically created when you click "Share App"
- Each share creates a new invite
- Old invites expire automatically
- No limit on number of invites

---

## Troubleshooting

### QR Code Issues

**Problem**: QR code won't scan
- **Solution**: Increase screen brightness
- **Solution**: Hold phone steady, focus camera
- **Solution**: Try different camera app
- **Solution**: Use "Download QR" and send image instead

**Problem**: QR code won't generate
- **Solution**: Refresh the page
- **Solution**: Check browser console for errors
- **Solution**: Use Web Share instead

---

### Web Share Issues

**Problem**: "Share" button not showing
- **Solution**: Your browser doesn't support Web Share
- **Solution**: Use "Copy" button instead
- **Solution**: Works on all mobile browsers

**Problem**: Share menu not opening
- **Solution**: Browser blocked the share
- **Solution**: Allow pop-ups for this site
- **Solution**: Use copy/paste instead

---

### Local Network Issues

**Problem**: No local URLs showing
- **Solution**: Browser blocked WebRTC
- **Solution**: Check browser permissions
- **Solution**: Fallback URL will still work

**Problem**: Friend can't access local URL
- **Solution**: Verify same WiFi network
- **Solution**: Check firewall settings
- **Solution**: Try different URL from list
- **Solution**: Use regular share instead

---

### Installation Issues

**Problem**: Install prompt not showing
- **Solution**: May already be installed
- **Solution**: Check if app in installed apps
- **Solution**: Use "Open in Browser" instead

**Problem**: Installation failed
- **Solution**: Check device storage space
- **Solution**: Update browser to latest version
- **Solution**: Try different browser
- **Solution**: Use web version (no install needed)

---

## Privacy & Security

### What's Shared

**In the invite:**
- Your display name (optional)
- Unique invite code
- Expiration date

**NOT shared:**
- Your messages
- Your contacts
- Your location
- Any personal data

### How It Works

1. **Invite codes** are cryptographically secure (32 random bytes)
2. **Signatures** verify authenticity (Ed25519)
3. **Local network** uses WebRTC (client-side only)
4. **No tracking** - zero analytics or monitoring
5. **HTTPS** enforced for security

### Best Practices

- ✅ Share invites only with people you trust
- ✅ Use local network for maximum privacy
- ✅ Invites expire automatically (secure by default)
- ✅ Each invite is one-time use
- ⚠️ Don't share invites publicly
- ⚠️ Invites grant access to your identity

---

## Advanced Features

### Download QR Code

1. Click "💾 Download QR" button
2. Save PNG image to device
3. Share image via any method
4. Print for physical handouts
5. Post on bulletin boards

**Use cases:**
- Events and meetups
- Business cards
- Posters and flyers
- Email signatures
- Digital marketing

### Multiple Sharing Methods

You can use multiple methods at once:

1. Show QR code on screen
2. Also send link via message
3. Share on local network
4. Download QR for later

All methods use the same invite - friend only needs one.

### Custom Inviter Name

Your display name appears in invites. To set it:

1. Go to Settings (⚙️ icon)
2. Update "Display Name"
3. New invites will use this name
4. Existing invites keep old name

---

## FAQ

**Q: How many friends can I invite?**
A: Unlimited! Create as many invites as you need.

**Q: Do invites cost anything?**
A: No, completely free. No server costs, no fees.

**Q: Can I revoke an invite?**
A: Invites expire automatically after 7 days. For immediate revocation, close the share modal.

**Q: What if my friend's phone is old?**
A: Works on any phone from the last 5+ years. Modern browsers required.

**Q: Does this work offline?**
A: Local network sharing works offline (with WiFi). Regular sharing requires internet for initial setup.

**Q: Is it safe?**
A: Yes! Cryptographically signed invites, end-to-end encryption, no central servers.

**Q: Can I share with multiple friends at once?**
A: Yes! Share the same QR code/link with multiple people. Each person gets their own connection.

**Q: What browsers work?**
A: All modern browsers:
- Chrome/Edge 89+
- Safari 14+
- Firefox (clipboard fallback)
- Mobile browsers (full support)

---

## Tips for Best Experience

### For QR Codes:
- 📱 Good lighting helps scanning
- 📱 Hold camera 6-12 inches away
- 📱 Make sure code fills screen
- 📱 Download and zoom if needed

### For Web Share:
- 📤 Works best on mobile devices
- 📤 Native apps integrate seamlessly
- 📤 Choose messaging apps friends use
- 📤 Link preview shows invite details

### For Local Network:
- 🌐 Great for privacy-focused users
- 🌐 No internet = no tracking
- 🌐 Perfect for events/meetups
- 🌐 Try all URLs if one doesn't work

### For All Methods:
- ✅ Test with a friend first
- ✅ Have friend install before event
- ✅ Keep spare invites ready
- ✅ Use method friend is comfortable with

---

## Getting Help

If you encounter issues:

1. **Check this guide** - Most common issues covered
2. **Browser console** - Look for error messages
3. **Try different method** - All methods work independently
4. **Update browser** - Latest version recommended
5. **Report bugs** - Help us improve!

---

## Next Steps

After your friend installs:

1. **They'll see you** in their contact list
2. **Start chatting** immediately
3. **Messages are encrypted** end-to-end
4. **No servers** - peer-to-peer connection
5. **Invite more friends** and grow your network!

---

**Welcome to decentralized, private communication!** 🎉

---

*Last updated: 2025*
*Sovereign Communications - Secure • Decentralized • Private*
