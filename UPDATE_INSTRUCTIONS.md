# How to Update the DungeonCuties Notification Popup

When DungeonCuties gets a new update, follow these steps:

## 1. Edit `index.html`

Find the update modal section and update:

### Update the version number:
```javascript
const CURRENT_VERSION = '2.0'; // Change this to '2.1', '3.0', etc.
```

### Update the badge:
```html
<div class="update-badge">v2.0 - Major Update</div>
```

### Update the "What's New" list:
```html
<ul class="update-list">
    <li>✨ <strong>New Feature</strong> - Description here</li>
    <li>💰 <strong>Another Feature</strong> - More details</li>
    <!-- Add/remove items as needed -->
</ul>
```

## 2. Commit and Push

```bash
cd /home/mark/emtesseract.com
git add index.html
git commit -m "Update DungeonCuties notification to v2.1"
git push
```

## 3. How it Works

- The popup shows automatically when users visit emTesseract.com
- It only shows once per version (tracked via localStorage)
- Users can close it by:
  - Clicking the X button
  - Clicking outside the popup
  - Clicking "Play Now"
- Once closed, they won't see it again until you change `CURRENT_VERSION`

## Tips

- Keep the feature list concise (8-10 items max)
- Use emojis for visual appeal
- Highlight the most exciting features first
- Update the version badge to match the version number
