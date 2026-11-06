# ROOTED — Complete New Testament Study: Quality-Control Report

Build date: 6 November 2026

## Deliverables

| File | What it is |
|---|---|
| `ROOTED_Complete_Expanded_New_Testament_Study.epub` | Final EPUB 3 for Google Play Books |
| `ROOTED_Complete_Expanded_New_Testament_Study_Manuscript.docx` | Editable manuscript (Word), generated from the final EPUB |
| `ROOTED_Complete_Expanded_New_Testament_Study_Manuscript.md` | Editable manuscript (Markdown), generated from the final EPUB |
| `ROOTED_QC_Report.md` | This report |

The chapter source files (`chapters/*.md`, `books/*.md`) and build tools in the repository are the master manuscript; the DOCX and Markdown are exports of it.

## Completion

| Check | Result |
|---|---|
| Chapters completed | **260 of 260** (all 27 books, Matthew 1 – Revelation 22) |
| Book introductions | 27 of 27 |
| Chapter structure | Every chapter has title, Chapter Theme, Main Teaching, and the four sections in order (Background and Story → Important Verses Explained → How to Apply → Chapter Prayer) |
| Verse studies | **955** in total; every chapter has 2–4 (2 chapters have 2, 81 have 3, 177 have 4) |
| Verse-study format | Every study has "Reference — Title", the full WEB verse text, Simple Explanation, Deeper Spiritual Meaning, and Applying This Teaching to Life Today |
| Duplicate verse studies | None (no verse or range is studied twice anywhere in the book) |
| Prayers | **260**: exactly one per chapter, each containing one "Amen" and ending "In Jesus' name, Amen." |
| Total length | About 903,000 words |

### Length by section of the New Testament

Average words per chapter: Gospels 3,800–3,900; Acts 3,560; Paul's letters 3,000–3,700; Hebrews–Jude 3,250–4,100 (2 and 3 John about 2,640 each, as single 13–14 verse chapters); Revelation 3,180. The shortest chapter in the book is Revelation 10 at about 2,470 words. Revelation chapters run about 15% shorter on average than Gospel chapters. Gospel chapters cover longer passages, but this is worth knowing if you want later books to match the Gospels' length exactly.

## Content removed or excluded

Automated scans across all chapters found none of the following: exercises, quizzes, answer keys, trackers, "write down" / "ask yourself" instructions, journaling prompts, placeholders (TODO, TBD, "[insert…]"), or hypothetical named characters. The two scan hits that remained were checked by hand and are fine: Anna the prophetess (Luke 2) and an artist's sketch used as a metaphor (1 Timothy 1).

## Scripture quotations

- **Translation:** World English Bible (WEB, public domain), from the ebible.org USFM text.
- **Verse blocks:** All 955 study verses are inserted directly from the WEB text by the build, so they cannot be misquoted.
- **Inline quotations:** 6,736 inline Scripture quotations use checked markup. The build fails if any of them does not match the WEB wording (ignoring case and punctuation) or cites a verse that doesn't exist.
- **Final sweep:** Every remaining phrase in plain quotation marks was compared against the whole WEB Bible. About 60 near-quotations that didn't match WEB exactly were found in earlier chapters (for example Mark 3:4, Mark 15:31, Luke 12:17, Acts 15:1, Romans 15:7, 1 Corinthians 6:11). They were corrected to exact WEB wording or reworded so they are no longer presented as quotations.
- The other plain-quoted phrases are clearly labeled as something other than WEB Scripture: Greek or Hebrew word meanings, alternate translations and manuscript readings, creeds and catechisms, historical inscriptions and writers, or a person's words in an illustration. They are not presented as WEB quotations.
- Scripture is italicized; the build italicizes all Scripture references automatically.

## EPUB validation

| Check | Result |
|---|---|
| Format | EPUB 3 (package 3.0), with an EPUB 2 NCX and guide included for older readers |
| EPUBCheck 5.1.0 (EPUB 3.3 rules) | **0 fatal errors, 0 errors, 0 warnings, 0 infos** |
| Table of contents | Clickable navigation document: front matter, 27 books, and all 260 chapters, plus in-chapter links (previous / next / book contents) |
| Metadata | Title "ROOTED — Complete New Testament Study"; subtitle; language en-US; description; subjects; rights statement for WEB; unique identifier; modified date |

## Cover

The original cover image was carried over unchanged. It is byte-for-byte identical to the cover in the uploaded EPUB (SHA-256 `7b7eebbe…6bb821` in both files) and is marked as the EPUB cover image.

## Theological handling

Sensitive passages are handled as the brief asked. Marriage and divorce texts state that abuse is never to be tolerated and point to safety. Slavery texts are explained in context, and their misuse is rejected. Passages about Jewish opponents (for example 1 Thessalonians 2, John 8, Revelation 2–3) include clear cautions against antisemitism. End-times texts (the rapture, tribulation, antichrist, the millennium, the nature of final judgment) present the major Christian views fairly: preterist, historicist, futurist, and idealist approaches to Revelation, and premillennial, amillennial, and postmillennial views of Revelation 20.

## Limitations

- **Quotation checking is mechanical.** It confirms wording against the WEB text, not that each quote is the best verse for the point being made. Phrases in plain quotation marks that are glosses or historical quotes were reviewed by category, not each against a source.
- **Historical and background details** (dates, archaeology, Roman history, early church tradition) reflect standard reference scholarship. They were not checked against individual sources, and dates are given as approximate where scholars disagree.
- **Interpretive views** are summarized fairly but not exhaustively, and no denominational review board has checked the commentary. A pastor or theological editor's read-through is recommended before publication.
- **Google Play Books** acceptance was not tested by uploading. The file passes EPUBCheck cleanly, which is the standard Google Play uses.
- **The DOCX and Markdown files** are automatic conversions of the EPUB. Text and headings are complete, but styling is simpler than the EPUB's.
