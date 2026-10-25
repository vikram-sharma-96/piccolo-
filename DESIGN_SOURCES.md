# Piccolo design sources · 0.4

Reviewed 25 October 2026. Existing installed skills were inspected first. Missing skills were installed with Codex's supported `install-skill-from-github.py` workflow, using the bundled Python runtime. Repository instructions and the user's browser requirements take precedence.

| Source | Revision | Use |
| --- | --- | --- |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines) | `063bee94c3f4df8453406c830b0a7df0f2860278` | Installed `web-design-guidelines`; read SKILL.md and the interface reference. Focus, labels, forms, motion and semantic state colors. |
| [Vercel interface reference](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md) | `434b7f91364665f2f733b310ec54809bf8f37937` | Upstream has `command.md`, not SKILL.md. Pinned reference saved in `docs/references/`; no fictitious skill installation. |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill/tree/6010f91a9935f1c167dfc500fb1a475681892e6b/skills/taste-skill) | `6010f91a9935f1c167dfc500fb1a475681892e6b` | Installed `taste-skill`; read SKILL.md and app-screen/motion guidance. Generated `.taste-skill/piccolo/direction.json`, seed 66628346. |
| Existing Karpathy guidelines | Installed local SKILL.md | Surgical changes, explicit assumptions and verifiable behavior. |

The app-screen direction is adapted to Piccolo: horizontal browser chrome, sidebar off by default, the existing wordmark, wallpaper controls and compact menus remain. No marketing-page layout or mandatory sidebar was adopted. Neutral surfaces, readable secondary text, common semantic tokens and restrained feedback were applied to browser-owned pages.

The actual Piccolo MCP server supplies section inventory and screenshots. Electron tests supplement scoped MCP capabilities for keyboard injection, native choosers, reduced motion, OS appearance signals and clearing isolated fixture data. This is the appropriate inspector for WebContentsView stacking; opening a separate generic HTML preview would not verify native surfaces.

Motion uses short CSS/WAAPI effects, no animation package or new renderer. Tab removal ghosts are inert, inaccessible chrome-only snapshots; reordering animates browser tabs only. Low-power and OS reduced-motion settings suppress nonessential effects. Native browsing surfaces never animate.

Screenshots were inspected for light/dark Settings and new-tab pages, plus the minimum-size/scaled layout. See `test-results/appearance-audit.json` for the latest evidence directory. Native operating-system menus, file choosers and security dialogs retain OS appearance; this limitation is described in APPLICATION_AUDIT.md.
