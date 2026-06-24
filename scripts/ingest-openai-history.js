import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCE_DIR = process.env.OPENAI_HISTORY_DIR || path.join(ROOT, 'openai-history');
const SOURCE_JSON = path.join(SOURCE_DIR, 'conversations.json');
const OUT_DIR = path.join(ROOT, 'public', 'archive-data');
const CONV_DIR = path.join(OUT_DIR, 'conversations');
const ASSET_DIR = path.join(ROOT, 'public', 'archive-assets');
const ASSET_URL_BASE = '/archive-assets/';
const ARTIFACTS_JSON = path.join(OUT_DIR, 'artifacts.json');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const MAX_SEARCH_TEXT = 24000;
const MAX_ARTIFACT_TEXT = 12000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function slugify(value, fallback) {
  const clean = String(value || fallback || 'conversation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return clean || fallback || 'conversation';
}

function stableId(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function epochToIso(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function stripControlMarkup(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\uE200[^\uE201]*\uE201/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectExportFiles() {
  const files = [];
  const stack = [SOURCE_DIR];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        files.push(full);
      }
    }
  }
  return files;
}

function buildAssetIndex(files) {
  const byKey = new Map();
  const imageFiles = [];

  function add(key, file) {
    if (!key) return;
    const normalized = key.toLowerCase();
    if (!byKey.has(normalized)) byKey.set(normalized, []);
    byKey.get(normalized).push(file);
  }

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    imageFiles.push(file);
    const name = path.basename(file);
    const stem = name.slice(0, name.length - ext.length);
    add(stem, file);

    const fileIds = name.match(/file[-_][A-Za-z0-9]+/g) || [];
    for (const id of fileIds) add(id, file);

    const hashPrefix = stem.match(/^[a-f0-9]{12,20}/i)?.[0];
    if (hashPrefix) add(hashPrefix, file);
  }

  return { byKey, imageFiles };
}

function pickAsset(candidates) {
  if (!candidates || !candidates.length) return null;
  return candidates
    .slice()
    .sort((a, b) => {
      const ae = path.extname(a).toLowerCase();
      const be = path.extname(b).toLowerCase();
      const score = (ext) => (ext === '.png' ? 0 : ext === '.jpg' || ext === '.jpeg' ? 1 : 2);
      return score(ae) - score(be) || a.length - b.length;
    })[0];
}

function assetKeysFromPointer(pointer) {
  const text = String(pointer || '');
  const keys = new Set();
  const fileIds = text.match(/file[-_][A-Za-z0-9]+/g) || [];
  for (const id of fileIds) keys.add(id);

  const base = path.basename(text.replace(/^file-service:\/\//, '').replace(/^sediment:\/\//, ''));
  if (base) {
    keys.add(base);
    const noExt = base.replace(/\.[a-z0-9]+$/i, '');
    keys.add(noExt);
  }
  return [...keys];
}

function copyAsset(sourceFile, copied) {
  const name = path.basename(sourceFile);
  const dest = path.join(ASSET_DIR, name);
  if (!fs.existsSync(dest)) fs.copyFileSync(sourceFile, dest);
  copied.add(sourceFile);
  return ASSET_URL_BASE + encodeURIComponent(name);
}

function resolveLocalAsset(pointer, assetIndex, copied, manifest) {
  for (const key of assetKeysFromPointer(pointer)) {
    const file = pickAsset(assetIndex.byKey.get(key.toLowerCase()));
    if (file) {
      return {
        kind: 'local',
        url: copyAsset(file, copied),
        resolvedPath: path.relative(SOURCE_DIR, file),
      };
    }
  }
  manifest.unresolvedPointers.add(String(pointer));
  return { kind: 'missing', url: '', resolvedPath: null };
}

function walk(value, visitor) {
  if (!value || typeof value !== 'object') return;
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
  } else {
    for (const item of Object.values(value)) walk(item, visitor);
  }
}

function extractTextFromContent(content) {
  if (!content) return '';
  if (typeof content.text === 'string') return content.text;
  if (Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.text) return part.text;
        if (part?.content_type === 'audio_transcription' && part.text) return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

function extractCodeFences(text) {
  const blocks = [];
  const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(last, match.index);
    if (before.trim()) blocks.push({ type: 'markdown', text: before.trim() });
    blocks.push({
      type: 'code',
      language: (match[1] || 'text').trim() || 'text',
      text: match[2].replace(/\n$/, ''),
    });
    last = regex.lastIndex;
  }

  const after = text.slice(last);
  if (after.trim()) blocks.push({ type: 'markdown', text: after.trim() });
  return blocks.length ? blocks : text.trim() ? [{ type: 'markdown', text: text.trim() }] : [];
}

function normalizeSpecialText(text, refs) {
  let output = String(text || '');

  for (const ref of refs || []) {
    if (ref.matched_text && ref.alt) {
      output = output.split(ref.matched_text).join(ref.alt);
    }
  }

  output = output.replace(/\uE200image_group\uE202([\s\S]*?)\uE201/g, '\n[Image group]\n');
  output = output.replace(/\uE200entity\uE202([\s\S]*?)\uE201/g, (_, body) => {
    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed) ? parsed[1] || parsed[0] || 'Entity' : 'Entity';
    } catch {
      return 'Entity';
    }
  });
  output = output.replace(/\uE200[^\uE201]*\uE201/g, '');
  return output;
}

function extractReferences(message) {
  const refs = [];
  const contentRefs = message?.metadata?.content_references || [];
  for (const ref of contentRefs) {
    if (ref.type === 'image_group') {
      refs.push({ type: 'image_group', label: 'Image group' });
    } else if (ref.type === 'entity') {
      refs.push({ type: 'entity', label: ref.name || ref.alt || 'Entity' });
    } else if (ref.url) {
      refs.push({ type: ref.type || 'reference', label: ref.title || ref.url, url: ref.url });
    } else if (ref.alt || ref.prompt_text) {
      refs.push({ type: ref.type || 'reference', label: stripControlMarkup(ref.alt || ref.prompt_text) });
    }
  }

  const citations = message?.metadata?.citations || [];
  for (const citation of citations) {
    refs.push({
      type: 'citation',
      label: citation.title || citation.metadata?.title || citation.url || 'Citation',
      url: citation.url,
    });
  }

  return refs;
}

function extractTextUrls(text) {
  const urls = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = match[0].replace(/[.,;:!?]+$/g, '');
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function artifactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ARTIFACT_TEXT);
}

function classifyDocument(text, conversationTitle) {
  const sample = `${conversationTitle}\n${text}`.toLowerCase();
  if (/\breadme\b|#\s+readme/.test(sample)) return 'README';
  if (/release\s+notes?|changelog|version\s+notes?/.test(sample)) return 'Release notes';
  if (/specification|requirements?|acceptance criteria|success criteria/.test(sample)) return 'Specification';
  if (/architecture|data flow|system design|design doc/.test(sample)) return 'Architecture';
  if (/standard|policy|procedure|runbook|operating model/.test(sample)) return 'Standard';
  if (/roadmap|milestone|phase\s+\d+/.test(sample)) return 'Roadmap';
  return 'Document';
}

function looksDocumentLike(block, conversationTitle) {
  if (block.type !== 'markdown') return false;
  const text = block.text || '';
  if (text.length >= 900) return true;
  const sample = `${conversationTitle}\n${text}`.toLowerCase();
  return /\breadme\b|release\s+notes?|specification|architecture|standard|runbook|roadmap|requirements?|acceptance criteria/.test(sample);
}

function buildConversationArtifacts(summary, messages) {
  const artifacts = {
    code: [],
    assets: [],
    documents: [],
    links: [],
  };
  const seenLinks = new Set();

  for (const message of messages.filter((item) => !item.hidden)) {
    message.blocks.forEach((block, blockIndex) => {
      if (block.type === 'code') {
        const language = artifactText(block.language || 'text').toLowerCase() || 'text';
        artifacts.code.push({
          id: stableId(`code:${summary.id}:${message.id}:${blockIndex}`),
          type: 'code',
          conversationId: summary.id,
          conversationTitle: summary.title,
          messageId: message.id,
          createTime: message.createTime,
          role: message.role,
          language,
          preview: artifactText(block.text).slice(0, 260),
          text: block.text,
          searchText: artifactText(`${summary.title}\n${language}\n${block.text}`),
        });
      } else if (looksDocumentLike(block, summary.title)) {
        const title = block.text.match(/^#{1,4}\s+(.+)$/m)?.[1]?.trim() || summary.title;
        const documentType = classifyDocument(block.text, summary.title);
        artifacts.documents.push({
          id: stableId(`document:${summary.id}:${message.id}:${blockIndex}`),
          type: 'document',
          conversationId: summary.id,
          conversationTitle: summary.title,
          messageId: message.id,
          createTime: message.createTime,
          role: message.role,
          documentType,
          title,
          preview: artifactText(block.text).slice(0, 360),
          searchText: artifactText(`${summary.title}\n${documentType}\n${title}\n${block.text}`),
        });
      }
    });

    message.assets.forEach((asset, assetIndex) => {
      artifacts.assets.push({
        id: stableId(`asset:${summary.id}:${message.id}:${asset.id}:${assetIndex}`),
        type: 'asset',
        conversationId: summary.id,
        conversationTitle: summary.title,
        messageId: message.id,
        createTime: message.createTime,
        role: message.role,
        kind: asset.kind,
        label: asset.label,
        original: asset.original,
        url: asset.url,
        width: asset.width,
        height: asset.height,
        searchText: artifactText(`${summary.title}\n${asset.kind}\n${asset.label}\n${asset.original}\n${asset.url}`),
      });
    });

    const links = [
      ...message.references.filter((ref) => ref.url).map((ref) => ({ label: ref.label, url: ref.url })),
      ...extractTextUrls(message.text).map((url) => ({ label: url, url })),
    ];
    links.forEach((link, linkIndex) => {
      const key = `${summary.id}:${message.id}:${link.url}`;
      if (seenLinks.has(key)) return;
      seenLinks.add(key);
      const domain = domainFromUrl(link.url);
      artifacts.links.push({
        id: stableId(`link:${key}:${linkIndex}`),
        type: 'link',
        conversationId: summary.id,
        conversationTitle: summary.title,
        messageId: message.id,
        createTime: message.createTime,
        role: message.role,
        label: artifactText(link.label || link.url).slice(0, 260),
        url: link.url,
        domain,
        searchText: artifactText(`${summary.title}\n${domain}\n${link.label || ''}\n${link.url}`),
      });
    });
  }

  return artifacts;
}

function extractAssets(message, assetIndex, copied, manifest) {
  const assets = [];
  const seen = new Set();

  function addAsset(input, label, dimensions) {
    if (!input || seen.has(input)) return;
    seen.add(input);

    if (/^https?:\/\//i.test(input)) {
      assets.push({
        id: stableId(input),
        kind: 'external',
        label: label || 'External image',
        url: input,
        original: input,
        ...dimensions,
      });
      manifest.externalUrls.add(input);
      return;
    }

    const resolved = resolveLocalAsset(input, assetIndex, copied, manifest);
    assets.push({
      id: stableId(input),
      kind: resolved.kind,
      label: label || path.basename(input),
      url: resolved.url,
      original: input,
      ...dimensions,
    });
  }

  const contentRefs = message?.metadata?.content_references || [];
  for (const ref of contentRefs) {
    if (Array.isArray(ref.safe_urls)) {
      for (const url of ref.safe_urls) addAsset(url, ref.title || ref.alt || 'Reference image');
    }
    if (Array.isArray(ref.images)) {
      for (const image of ref.images) {
        const result = image?.image_result;
        if (result?.content_url) {
          addAsset(result.content_url, result.title || image.image_search_query || 'Image result', result.content_size);
        }
      }
    }
  }

  walk(message?.content, (node) => {
    const nodeType = String(node.content_type || '').toLowerCase();
    if (nodeType.includes('audio') || nodeType.includes('video')) return;
    const candidates = [
      node.preview_asset_pointer,
      node.image_asset_pointer,
      node.url,
      node.content_url,
    ];
    if (nodeType.includes('image') || nodeType.includes('asset_pointer')) candidates.push(node.asset_pointer);
    for (const candidate of candidates) addAsset(candidate, node.name || node.title || node.content_type);
  });

  const text = JSON.stringify(message?.content || {});
  for (const match of text.matchAll(/file-service:\/\/[^"\\\s]+/g)) addAsset(match[0], 'Attached file');
  for (const match of text.matchAll(/https?:\/\/[^"\\\s)]+/g)) {
    if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(match[0])) addAsset(match[0], 'External image');
  }

  return assets;
}

function isHiddenMessage(message) {
  const md = message?.metadata || {};
  const role = message?.author?.role;
  return Boolean(
    md.is_visually_hidden_from_conversation ||
      md.is_user_system_message ||
      md.rebase_developer_message ||
      role === 'system' ||
      role === 'tool',
  );
}

function orderedNodes(conversation) {
  const mapping = conversation.mapping || {};
  const current = conversation.current_node;
  const chain = [];
  const seen = new Set();
  let cursor = current && mapping[current] ? current : null;

  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(mapping[cursor]);
    cursor = mapping[cursor].parent;
  }
  chain.reverse();

  const messages = chain.filter((node) => node.message);
  if (messages.length > 2) return messages;

  return Object.values(mapping)
    .filter((node) => node.message)
    .sort((a, b) => {
      const at = a.message?.create_time ?? 0;
      const bt = b.message?.create_time ?? 0;
      return at - bt;
    });
}

function normalizeMessage(node, assetIndex, copied, manifest) {
  const message = node.message;
  const content = message.content || {};
  const rawText = extractTextFromContent(content);
  const refs = message.metadata?.content_references || [];
  const text = normalizeSpecialText(rawText, refs);
  const blocks = [];

  if (content.content_type === 'code') {
    blocks.push({
      type: 'code',
      language: content.language || content.response_format_name || 'text',
      text: content.text || rawText,
    });
  } else if (content.content_type === 'execution_output' || content.content_type === 'citable_code_output') {
    blocks.push({
      type: 'execution',
      label: content.content_type === 'execution_output' ? 'Execution output' : 'Citable output',
      text: content.text || rawText,
    });
  } else if (content.content_type === 'system_error') {
    blocks.push({ type: 'notice', text: text || 'System error' });
  } else {
    blocks.push(...extractCodeFences(text));
  }

  return {
    id: message.id || node.id,
    role: message.author?.role || 'unknown',
    authorName: message.author?.name || null,
    createTime: message.create_time ?? null,
    status: message.status || null,
    contentType: content.content_type || 'unknown',
    text,
    blocks,
    assets: extractAssets(message, assetIndex, copied, manifest),
    references: extractReferences(message),
    hidden: isHiddenMessage(message),
    rawType: content.content_type || 'unknown',
  };
}

function summarizeConversation(conversation, messages) {
  const visible = messages.filter((message) => !message.hidden);
  const searchable = visible
    .map((message) => message.text)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
  const title = conversation.title || 'Untitled conversation';
  const id = conversation.conversation_id || conversation.id || stableId(title + conversation.create_time);
  const codeBlockCount = visible.reduce(
    (sum, message) => sum + message.blocks.filter((block) => block.type === 'code').length,
    0,
  );
  const assetCount = visible.reduce((sum, message) => sum + message.assets.length, 0);
  const externalAssetCount = visible.reduce(
    (sum, message) => sum + message.assets.filter((asset) => asset.kind === 'external').length,
    0,
  );

  return {
    id,
    title,
    slug: `${slugify(title, id)}-${id.slice(0, 8)}`,
    createTime: conversation.create_time ?? null,
    updateTime: conversation.update_time ?? null,
    createIso: epochToIso(conversation.create_time),
    updateIso: epochToIso(conversation.update_time),
    archived: Boolean(conversation.is_archived),
    starred: Boolean(conversation.is_starred),
    messageCount: visible.length,
    hiddenMessageCount: messages.length - visible.length,
    codeBlockCount,
    assetCount,
    externalAssetCount,
    snippet: searchable.slice(0, 220),
    searchText: `${title}\n${searchable}`.slice(0, MAX_SEARCH_TEXT),
  };
}

function cleanGeneratedDirs() {
  ensureDir(OUT_DIR);
  ensureDir(CONV_DIR);
  ensureDir(ASSET_DIR);
  for (const file of fs.readdirSync(CONV_DIR)) {
    if (file.endsWith('.json')) fs.rmSync(path.join(CONV_DIR, file), { force: true });
  }
}

function main() {
  if (!fs.existsSync(SOURCE_JSON)) {
    throw new Error(`Cannot find ${SOURCE_JSON}`);
  }

  cleanGeneratedDirs();
  console.log(`Reading export: ${SOURCE_JSON}`);
  const conversations = readJson(SOURCE_JSON);
  const exportFiles = collectExportFiles();
  const assetIndex = buildAssetIndex(exportFiles);
  const copied = new Set();
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourcePath: SOURCE_DIR,
    sourceImageFiles: assetIndex.imageFiles.length,
    copiedAssets: [],
    missingPointers: [],
    externalUrls: new Set(),
    unresolvedPointers: new Set(),
  };

  const summaries = [];
  const artifactIndex = {
    code: [],
    assets: [],
    documents: [],
    links: [],
  };
  let visibleMessages = 0;
  let hiddenMessages = 0;
  let missingAssets = 0;
  let externalAssets = 0;

  conversations.forEach((conversation, index) => {
    const nodes = orderedNodes(conversation);
    const messages = nodes.map((node) => normalizeMessage(node, assetIndex, copied, manifest));
    const summary = summarizeConversation(conversation, messages);
    visibleMessages += summary.messageCount;
    hiddenMessages += summary.hiddenMessageCount;
    missingAssets += messages.reduce(
      (sum, message) => sum + message.assets.filter((asset) => asset.kind === 'missing').length,
      0,
    );
    externalAssets += summary.externalAssetCount;

    const fileName = `${summary.id}.json`;
    writeJson(path.join(CONV_DIR, fileName), {
      ...summary,
      sourceIndex: index,
      messages,
    });
    summaries.push(summary);

    const artifacts = buildConversationArtifacts(summary, messages);
    artifactIndex.code.push(...artifacts.code);
    artifactIndex.assets.push(...artifacts.assets);
    artifactIndex.documents.push(...artifacts.documents);
    artifactIndex.links.push(...artifacts.links);
  });

  summaries.sort((a, b) => (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0));

  writeJson(path.join(OUT_DIR, 'index.json'), {
    generatedAt: new Date().toISOString(),
    sourcePath: SOURCE_DIR,
    totals: {
      conversations: summaries.length,
      visibleMessages,
      hiddenMessages,
      assets: copied.size + externalAssets + missingAssets,
      copiedAssets: copied.size,
      missingAssets,
      externalAssets,
    },
    conversations: summaries,
  });

  const languageCounts = {};
  for (const artifact of artifactIndex.code) {
    languageCounts[artifact.language] = (languageCounts[artifact.language] || 0) + 1;
  }
  writeJson(ARTIFACTS_JSON, {
    generatedAt: new Date().toISOString(),
    sourcePath: SOURCE_DIR,
    totals: {
      code: artifactIndex.code.length,
      assets: artifactIndex.assets.length,
      documents: artifactIndex.documents.length,
      links: artifactIndex.links.length,
    },
    languageCounts: Object.fromEntries(Object.entries(languageCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    code: artifactIndex.code,
    assets: artifactIndex.assets,
    documents: artifactIndex.documents,
    links: artifactIndex.links,
  });

  manifest.copiedAssets = [...copied].sort().map((file) => ({
    source: path.relative(SOURCE_DIR, file),
    url: ASSET_URL_BASE + encodeURIComponent(path.basename(file)),
  }));
  manifest.missingPointers = [...manifest.unresolvedPointers].sort();
  manifest.externalUrls = [...manifest.externalUrls].sort();
  delete manifest.unresolvedPointers;
  writeJson(path.join(OUT_DIR, 'assets-manifest.json'), manifest);

  console.log(`Conversations: ${summaries.length}`);
  console.log(`Visible messages: ${visibleMessages}`);
  console.log(`Hidden/raw messages: ${hiddenMessages}`);
  console.log(`Copied local assets: ${copied.size}`);
  console.log(`External image URLs: ${externalAssets}`);
  console.log(`Missing local pointers: ${missingAssets}`);
  console.log(`Indexed code artifacts: ${artifactIndex.code.length}`);
  console.log(`Indexed asset artifacts: ${artifactIndex.assets.length}`);
  console.log(`Indexed document artifacts: ${artifactIndex.documents.length}`);
  console.log(`Indexed link artifacts: ${artifactIndex.links.length}`);
}

main();
