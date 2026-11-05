import { describe, expect, it } from 'vitest';
import {
  getTargetPrefix,
  targetKey,
  SEED_COLLECTIONS,
  TYPOGRAPHY_OPTIONS,
} from '../../src/DualListRelationMatrix';
import type { KnowledgeState, KnowledgeTarget, KnowledgeCollectionItem } from '../../src/types';

describe('DualListRelationMatrix logic & configuration', () => {
  it('provides the correct single-character icon prefixes for high-density rows', () => {
    expect(getTargetPrefix('asset')).toBe('🖼️');
    expect(getTargetPrefix('document')).toBe('📄');
    expect(getTargetPrefix('code')).toBe('💻');
    expect(getTargetPrefix('conversation')).toBe('💬');
    expect(getTargetPrefix('link')).toBe('🔗');
  });

  it('generates consistent target keys for many-to-many relationship tracking', () => {
    const target: KnowledgeTarget = {
      targetType: 'code',
      targetId: 'snippet_123',
      conversationId: 'conv_abc',
      title: 'theme-override.css',
    };
    expect(targetKey(target)).toBe('code:snippet_123');
  });

  it('defines the three required typography pairings', () => {
    expect(TYPOGRAPHY_OPTIONS).toHaveLength(3);
    const ids = TYPOGRAPHY_OPTIONS.map((t) => t.id);
    expect(ids).toContain('ibm-plex');
    expect(ids).toContain('inter');
    expect(ids).toContain('source-sans');

    const ibm = TYPOGRAPHY_OPTIONS.find((t) => t.id === 'ibm-plex');
    expect(ibm?.sans).toBe('IBM Plex Sans');
    expect(ibm?.mono).toBe('IBM Plex Mono');

    const inter = TYPOGRAPHY_OPTIONS.find((t) => t.id === 'inter');
    expect(inter?.sans).toBe('Inter');
    expect(inter?.mono).toBe('JetBrains Mono');

    const source = TYPOGRAPHY_OPTIONS.find((t) => t.id === 'source-sans');
    expect(source?.sans).toBe('Source Sans 3');
    expect(source?.mono).toBe('Source Code Pro');
  });

  it('includes default seed collections matching the command center layout specification', () => {
    const names = SEED_COLLECTIONS.map((c) => c.name);
    expect(names).toContain('City Hall Rebrand');
    expect(names).toContain('Core System Upgrade');
    expect(names).toContain('First Gen Lang-Logos');
    expect(names).toContain('Theme Review Feedback');
    expect(names).toContain('Project Proposal');
    expect(names).toContain('App Design');
    expect(names).toContain('Sandbox Test');
  });

  it('correctly tracks many-to-many sharing of items across multiple collections', () => {
    const state: KnowledgeState = {
      tags: [],
      collections: [
        { id: 1, name: 'City Hall Rebrand', createdAt: 1 },
        { id: 2, name: 'Core System Upgrade', createdAt: 2 },
        { id: 3, name: 'First Gen Lang-Logos', createdAt: 3 },
      ],
      tagLinks: [],
      collectionItems: [
        { collectionId: 1, targetType: 'asset', targetId: 'img_1', conversationId: 'c1', title: 'img_xZWxJr.png', createdAt: 10 },
        { collectionId: 2, targetType: 'asset', targetId: 'img_1', conversationId: 'c1', title: 'img_xZWxJr.png', createdAt: 11 },
        { collectionId: 3, targetType: 'asset', targetId: 'img_1', conversationId: 'c1', title: 'img_xZWxJr.png', createdAt: 12 },
        { collectionId: 1, targetType: 'document', targetId: 'doc_1', conversationId: 'c1', title: 'feedback.md', createdAt: 13 },
      ],
      notes: [],
      favorites: [],
    };

    // Calculate how many collections share img_1
    const img1Colls = state.collectionItems
      .filter((ci) => targetKey(ci) === 'asset:img_1')
      .map((ci) => ci.collectionId);
    const uniqueColls = Array.from(new Set(img1Colls));
    expect(uniqueColls).toHaveLength(3);
    expect(uniqueColls).toEqual([1, 2, 3]);

    // doc_1 is only in collection 1
    const doc1Colls = state.collectionItems
      .filter((ci) => targetKey(ci) === 'document:doc_1')
      .map((ci) => ci.collectionId);
    expect(Array.from(new Set(doc1Colls))).toHaveLength(1);
  });

  it('supports direct unlinking of pointer relations', () => {
    const items: KnowledgeCollectionItem[] = [
      { collectionId: 1, targetType: 'code', targetId: 'code_1', conversationId: 'c1', title: 'theme-override.css', createdAt: 1 },
      { collectionId: 2, targetType: 'code', targetId: 'code_1', conversationId: 'c1', title: 'theme-override.css', createdAt: 2 },
    ];

    // Unlink code_1 from collection 1 only
    const unlinked = items.filter((item) => !(item.collectionId === 1 && targetKey(item) === 'code:code_1'));
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0].collectionId).toBe(2);
  });
});
