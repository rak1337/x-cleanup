# x-cleanup

Delete all your posts and replies and undo your reposts on X (Twitter) straight from your browser. Likes are not touched.

> ⚠️ Deletions are permanent.

## How to use

1. Sign in to [x.com](https://x.com) on a desktop browser.
2. Go to your profile's **Replies** tab: `https://x.com/<your-username>/with_replies`
3. Open the browser console: `F12` (or `Cmd` + `Option` + `J` on Mac) and select the **Console** tab.
4. Copy everything in [`x-cleanup.js`](x-cleanup.js), paste it into the console, and press **Enter**.
   - If Chrome blocks pasting, type `allow pasting` and press Enter first.
5. Click **OK** to confirm. Progress appears in the console.

Keep the tab open and visible until the summary is printed.

**To stop:** run `window.stopXCleanup = true` in the console.

## License

[MIT](LICENSE)
