/*!
 * x-cleanup — delete your own posts and replies and undo your reposts on X (Twitter).
 * Runs in the browser console on your own profile page. No install, no API keys.
 * MIT License — see LICENSE. Use at your own risk: deletions are irreversible.
 */
(async () => {
  // ── CONFIGURATION ─────────────────────────────
  const MAX = Infinity;
  const ACTION_DELAY = 650;
  const SCROLL_DELAY = 700;
  const BOTTOM_WAIT = 6000;
  const EMPTY_PASSES_TO_STOP = 3;
  const MAX_RETRIES = 2;

  const BATCH_SIZE = 25;
  const BATCH_PAUSE = 4000;

  // ── INITIALIZATION ────────────────────────────
  if (window.xCleanupRunning) {
    console.warn("Cleanup is already running.");
    return;
  }

  const parts = location.pathname.split("/").filter(Boolean);
  const username = parts[0]?.toLowerCase();
  const tab = parts[1] || "";

  if (
    !["x.com", "www.x.com", "twitter.com"].includes(location.hostname) ||
    !username ||
    !/^[a-z0-9_]{1,15}$/i.test(username) ||
    !["", "with_replies", "reposts"].includes(tab) ||
    !document.querySelector('[data-testid="primaryColumn"]')
  ) {
    console.error("Open your own X profile or Replies tab.");
    return;
  }

  // Detect signed-in account when X exposes it.
  // No username input is required.
  const switcher = document.querySelector(
    '[data-testid="SideNav_AccountSwitcher_Button"]'
  );

  const signedIn = switcher?.textContent
    ?.match(/@([A-Za-z0-9_]+)/)?.[1]?.toLowerCase();

  if (signedIn && signedIn !== username) {
    console.error(
      `Signed in as @${signedIn}, but viewing @${username}.`
    );
    return;
  }

  if (!signedIn) {
    console.warn(
      "Could not independently verify the signed-in account. " +
      `Make sure @${username} is your account.`
    );
  }

  // Only one confirmation; no username prompt
  if (!confirm(
    `Remove all accessible posts, replies and reposts from @${username}?\n\n` +
    "This is irreversible. Likes will remain untouched."
  )) return;

  window.xCleanupRunning = true;
  window.stopXCleanup = false;

  // ── HELPERS ───────────────────────────────────
  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const visible = el =>
    el && el.isConnected && el.getClientRects().length > 0;

  const waitFor = async (find, timeout = 4000) => {
    const start = Date.now();

    while (
      !window.stopXCleanup &&
      Date.now() - start < timeout
    ) {
      const result = find();

      if (result && visible(result)) return result;

      await sleep(100);
    }

    return null;
  };

  const menuItems = () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .filter(visible);

  const menuText = el =>
    (el.innerText || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

  const findMenuItem = pattern =>
    menuItems().find(el => pattern.test(menuText(el)));

  const scroller = document.scrollingElement;

  const atBottom = () =>
    scroller.scrollTop + scroller.clientHeight >=
    scroller.scrollHeight - 150;

  const scrollDown = () =>
    window.scrollBy({
      top: window.innerHeight * 0.85,
      behavior: "instant"
    });

  const scrollToTop = () =>
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

  // ── STATE ─────────────────────────────────────
  const done = new Set();
  const failed = new Map();
  const lastTriedPass = new Map();

  let removed = 0;
  let skipped = 0;
  let pass = 1;
  let emptyPasses = 0;
  let bottomChecks = 0;
  let passStartCount = 0;

  const started = Date.now();

  console.log(`🚀 Starting cleanup for @${username}`);
  console.log("Stop anytime: window.stopXCleanup = true");

  // ── MAIN LOOP ─────────────────────────────────
  try {
    while (!window.stopXCleanup && removed < MAX) {
      let handled = false;

      // Prevent processing another profile after navigation
      const currentParts = location.pathname
        .split("/")
        .filter(Boolean);

      if (
        currentParts[0]?.toLowerCase() !== username ||
        currentParts[1] !== (tab || undefined)
      ) {
        console.warn("Profile or tab changed. Stopping.");
        break;
      }

      const tweets = [
        ...document.querySelectorAll(
          '[data-testid="primaryColumn"] article[data-testid="tweet"]'
        )
      ];

      for (const tweet of tweets) {
        if (window.stopXCleanup || removed >= MAX) break;

        // Ignore nested quote previews
        if (tweet.closest('[data-testid="quoteTweet"]')) {
          continue;
        }

        const link = tweet.querySelector(
          'a[href*="/status/"] time'
        )?.closest("a");

        const url = link?.getAttribute("href");

        const match = url?.match(
          /\/([A-Za-z0-9_]+)\/status\/(\d+)/
        );

        if (!match) continue;

        const author = match[1].toLowerCase();
        const id = match[2];

        const isOwnPost = author === username;

        const undo = tweet.querySelector(
          '[data-testid="unretweet"]'
        );

        const action = undo
          ? "unrepost"
          : isOwnPost
            ? "delete"
            : null;

        if (!action) continue;

        const key = `${action}:${id}`;

        if (done.has(key)) continue;

        if (lastTriedPass.get(key) === pass) continue;

        if ((failed.get(key) || 0) >= MAX_RETRIES) {
          continue;
        }

        lastTriedPass.set(key, pass);
        handled = true;

        try {
          // ── DELETE POST / REPLY ───────────────
          if (action === "delete") {
            const caret = tweet.querySelector(
              '[data-testid="caret"]'
            );

            if (!caret) {
              throw new Error("Menu button missing");
            }

            caret.click();

            const deleteButton = await waitFor(() =>
              [...document.querySelectorAll(
                '[data-testid="deleteTweet"]'
              )].find(visible) ||
              findMenuItem(/^Delete(?: post)?$/i)
            );

            if (!deleteButton) {
              console.warn(
                "Available menu options:",
                menuItems().map(menuText)
              );

              throw new Error("Delete option missing");
            }

            deleteButton.click();

            const confirmDelete = await waitFor(() =>
              [...document.querySelectorAll(
                '[data-testid="confirmationSheetConfirm"]'
              )].find(visible)
            );

            if (!confirmDelete) {
              throw new Error("Delete confirmation missing");
            }

            confirmDelete.click();

          } else {
            // ── UNDO REPOST ─────────────────────
            undo.click();

            const confirmUndo = await waitFor(() =>
              [...document.querySelectorAll(
                '[data-testid="unretweetConfirm"]'
              )].find(visible)
            );

            if (!confirmUndo) {
              throw new Error("Undo repost confirmation missing");
            }

            confirmUndo.click();
          }

          done.add(key);
          removed++;
          bottomChecks = 0;

          console.log(
            `✅ ${removed} | ${action} attempted | ${url}`
          );

          // Periodic cooldown
          if (removed % BATCH_SIZE === 0) {
            console.log(
              `⏸ ${removed} actions. Cooling down...`
            );

            await sleep(BATCH_PAUSE);
          }

        } catch (error) {
          const retries = (failed.get(key) || 0) + 1;

          failed.set(key, retries);
          skipped++;

          console.warn(
            `⚠️ ${action} failed (${retries}/${MAX_RETRIES}):`,
            url,
            error.message
          );

          // Attempt to close leftover menus
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              code: "Escape",
              bubbles: true
            })
          );

          document.body.click();
        }

        await sleep(ACTION_DELAY);
        break;
      }

      if (handled) continue;

      // ── CONTINUOUS SCROLLING ───────────────────
      scrollDown();
      await sleep(SCROLL_DELAY);

      if (!atBottom()) {
        bottomChecks = 0;
        continue;
      }

      // ── WAIT FOR MORE POSTS ───────────────────
      console.log("⏳ Checking for more posts...");

      const previousHeight = scroller.scrollHeight;

      await sleep(BOTTOM_WAIT);

      if (window.stopXCleanup) break;

      scrollDown();
      await sleep(SCROLL_DELAY);

      if (
        !atBottom() ||
        scroller.scrollHeight > previousHeight + 100
      ) {
        bottomChecks = 0;
        continue;
      }

      bottomChecks++;

      if (bottomChecks < 2) continue;

      bottomChecks = 0;

      // ── COMPLETE PASS ─────────────────────────
      const passRemoved = removed - passStartCount;

      if (passRemoved === 0) {
        emptyPasses++;
      } else {
        emptyPasses = 0;
      }

      console.log(
        `📋 Pass ${pass} complete. ` +
        `${passRemoved} removal attempts. ` +
        `${emptyPasses}/${EMPTY_PASSES_TO_STOP} empty passes.`
      );

      if (emptyPasses >= EMPTY_PASSES_TO_STOP) {
        console.log(
          "🏁 No further accessible items found."
        );
        break;
      }

      // ── RESCAN FROM TOP ───────────────────────
      pass++;
      passStartCount = removed;

      console.log(`🔄 Starting pass ${pass}...`);

      scrollToTop();
      await sleep(1500);
    }

  } catch (error) {
    console.error("Cleanup stopped unexpectedly:", error);

  } finally {
    window.xCleanupRunning = false;

    const seconds = (Date.now() - started) / 1000;

    console.log("════════════════════════════════");
    console.log("🏁 X CLEANUP SUMMARY");
    console.log("Account:", `@${username}`);
    console.log("Removal attempts:", removed);
    console.log("Failed attempts:", skipped);
    console.log("Unique items attempted:", done.size);
    console.log("Passes:", pass);
    console.log("Elapsed:", seconds.toFixed(1), "seconds");
    console.log(
      "Average rate:",
      seconds
        ? (removed * 60 / seconds).toFixed(1)
        : 0,
      "actions/min"
    );
    console.log("Stopped manually:", window.stopXCleanup);
    console.log("════════════════════════════════");
  }
})();
