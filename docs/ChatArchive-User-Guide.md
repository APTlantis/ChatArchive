# ChatArchive User Guide: Documents And Knowledge

This guide covers the v0.1.2 document workflow: finding recovered files, exporting them, and saving useful items into the Knowledge workspace with tags, collections, notes, and favorites.

## Open The Archive

1. Launch ChatArchive.
2. If prompted, choose the visible `ChatArchive/` library folder that contains `chatarchive.db`, `settings.json`, and the `archives/` folder.
3. If the library is empty, import an OpenAI export zip or extracted export folder.

ChatArchive stores its library outside the installed app package. Keep that folder in a location you can back up directly.

## Update Your ChatGPT Export

1. Open **Library** in the sidebar.
2. Select **Import newer OpenAI export** and choose the new ChatGPT data-export ZIP.
3. ChatArchive rebuilds the archive from that export while keeping your saved tags, collections, notes, favorites, pins, bookmarks, and project records.

If an item is not present in the newest export, its saved organization stays in the library and is marked **unavailable**. It becomes available again if a later export contains it. After a successful update, **Restore previous import** returns the archive and saved library state to the immediately preceding import; the current state becomes the next rollback copy.

## Find Documents

1. Select **Documents** in the top toolbar.
2. Use the search box to filter document titles and previews.
3. Use the document-type chips to narrow the list by Markdown, JSON, TOML, YAML, CSV, XML, HTML, PDF, Office, text, or other indexed document types.
4. Select a document row to open the preview pane.

Text-based documents preview in the app. PDF, Office, and other binary documents are preserved as original files and may show a short diagnostic preview instead of rendered content.

## Export A Document

1. Open **Documents**.
2. Select the document.
3. Choose **Export** or **Export original** in the preview pane.
4. Pick the destination in the save dialog.

For recovered source files, **Export original** copies the preserved source file without conversion. For text-like generated documents, the export writes Markdown content from the preview.

## Save A Document To Knowledge

1. Open **Documents**.
2. Select the document you want to keep track of.
3. Choose **Organize**.
4. In the organizer panel, use one or more of these actions:
   - **Favorite** marks the document as important.
   - Existing tag chips attach or remove tags.
   - **New tag** creates a tag and immediately applies it to the document.
   - Existing collection chips add or remove the document from a collection.
   - **New collection** creates a collection and immediately adds the document.
   - **Attach a note** records context directly on that document.
5. Close the organizer panel when finished.

The Knowledge workspace updates from those saved relationships. A document can belong to multiple tags and multiple collections, can have more than one note, and can also be favorited.

## Tag Conversations And Artifacts

The same organizer works for conversations, code snippets, documents, image assets, and links.

1. Open a conversation or explorer item.
2. Choose **Organize**.
3. Add tags, collections, notes, or a favorite.
4. Open **Knowledge** to browse saved collections, favorites, and recent notes.

Use tags for reusable labels such as `release`, `legal`, `design`, or `rust`. Use collections for grouped work such as a release candidate, a client project, a research theme, or a migration plan.

## Practical Filing Pattern

For release work, a compact pattern works well:

1. Tag source documents by topic, such as `msix`, `wack`, `release-note`, or `store`.
2. Create one collection for the release, such as `ChatArchive v0.1.2 Store`.
3. Add every relevant document, code snippet, and source conversation to that collection.
4. Attach short notes to explain why an item matters, especially when it records a decision, a failed path, or a certification result.
5. Use **Knowledge** as the review surface before writing final release notes or hash manifests.

## What Knowledge Saves

Knowledge saves organizer metadata in the library SQLite database:

- Tags
- Collections
- Collection membership
- Notes
- Favorites

It does not move, rename, or rewrite the original recovered document files. Exported copies are created only when you use the export action and choose a destination.

## Current Limits

- Binary formats such as PDF, DOCX, PPTX, and XLSX are preserved and exportable, but not rendered inline.
- Metadata-only document pointers remain visible when the OpenAI export did not include the matching source blob.
- Knowledge organization is manual in v0.1.2. Project Intelligence is deferred from the visible release surface.
