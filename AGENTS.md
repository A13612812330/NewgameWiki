# NewgameWiki Project Agent

This file is the project-specific operating guide for work inside `NewgameWiki`.

Any future task in this project should read this file first, then implement work based on the rules below.

## Product Direction

- This project is a game news and game pool site.
- Core modules:
  - Home
  - Mobile games
  - Welfare games
  - PC / Console / Steam
  - Admin
- Current priority is the mobile game pool and the admin for managing that pool.

## User Intent Rules

- Do not silently change the user's visual requirements.
- When the user gives a target layout from a screenshot, preserve that structure unless explicitly told to redesign it.
- The user is not technical, so UI and admin wording should stay direct, simple, and management-oriented.
- Prefer working software over placeholder wording.

## Frontend Card Rules

- Mobile game cards should follow the user's preferred layout:
  - Left: game icon
  - Center top: game name
  - Right top: status and event tags such as `预约`, `新游`
  - Under title: up to 3 game tags only
  - Right side of tag row: date like `06/24`
  - Middle: cleaned summary in one compact green content box
  - Bottom left: source tags only
  - Bottom right: `原文` button
- Do not place short status-only content like `首发` or `预约` as the main featured content block when richer content exists.
- Keep tag counts restrained:
  - Game tags: max 3 on main cards
  - Source tags: separate from game tags
  - Status tags: separate from source tags
- Do not show detailed event splits by default. Use only the merged event/status category such as `上线/测试`, `更新`, `活动/联动`; keep raw detail fields only for internal debugging.
- Preserve icon slots for all game cards.

## Content Cleaning Rules

- Do not show crawler/system wording on the frontend, such as:
  - "九游开测表抓取"
  - "保留游戏专区详情页"
  - "来源页提供游戏日历"
- Clean scraped content into short human-readable summary text.
- Prefer one concise sentence over duplicated fragments.
- Avoid showing repeated summary and update text if both mean the same thing.
- If a source only provides weak content like `首发`, `预约`, `新活动`, keep it in lower-priority areas like timelines instead of hero/feature cards.
- For mobile game names, split subtitle-like suffixes out of the main name:
  - text after `-`
  - text inside `()` or `（）`
- For public mobile pool data, subtitle parts should be cleaned into `subtitle` and should not remain inside `gameName`.
- Unlike welfare cards, mobile subtitles should stay available in data/admin but do not need default frontend emphasis.
- Some names are explicit exceptions and should stay whole, for example `像素火影-次世代`.

## Data Rules

- `原文` must point to the source site's game detail page, not a list page, not the site homepage, and not a local detail page.
- If a record has no real source detail URL, it should be treated as an issue and should not pretend to be complete.
- Public mobile pool data must be deduplicated by cleaned game identity, not just by detail URL.
- If the same game exists across multiple sources:
  - Merge into one visible game entry in the frontend
  - Preserve multi-source records in data for admin use
  - Prefer the most complete source for main content
- Do not mix fake/mock data into real data views.

## Source-Specific Rules

- Mobile public pool currently includes:
  - TapTap
  - 九游
  - 好游快爆
- Welfare pool will include:
  - 小七手游
  - 果盘游戏
  - 一元手游
  - 爱趣游戏
- Welfare pool only wants new games, not new servers.
- TapTap icons must be fetched and shown.
- 好游快爆 icons must be fetched and shown.

## Home Page Rules

- Home should prioritize entries with meaningful content in large featured cards.
- Timeline/tree areas can hold more date-first entries.
- Calendar should stay compact and show date-first information.
- Search should remain available from the top-right area and feel consistent with the page style.

## Admin Rules

- Admin is not only for mobile; it is the global management console.
- `来源管理` should be table-based, not card-based, and should include image samples where possible.
- `游戏池管理` should become an actual mobile pool management view, not just decorative summary blocks.
- The mobile pool management view should support a detail-oriented management mode with fields such as:
  - game icon
  - game name
  - game tags
  - vendor/source tags
  - summary
  - source detail links
  - merge/source record information
- `手游池管理` should feel like a real management workspace:
  - left side list for browsing games
  - top controls for search and quick filtering
  - right side detail panel for the selected game
  - detail sections should be grouped into clear boxes instead of long loose text
- Buttons in admin should reflect real state when backend behavior exists.
- Update logs should be understandable by a non-technical user.

## Design Rules

- Visual style should stay clean, compact, layered, and information-dense.
- Use obvious icons where useful, but do not make the page noisy.
- Avoid random redesign drift.
- Preserve the user's preferred card composition from provided screenshots unless asked otherwise.
- For the current mobile card reference, keep this exact hierarchy:
  - icon at left
  - title in the center
  - top-right status pills
  - below title: max 3 game tags only
  - date at the right of the game-tag row
  - middle green summary box
  - bottom-left source tags only
  - bottom-right `原文`

## Implementation Notes

- Before future edits:
  - read this file
  - check whether the task affects frontend layout, crawler cleaning, dedupe logic, or admin behavior
  - keep changes aligned with these rules
- When a new recurring user preference appears, update this file as part of the task.
