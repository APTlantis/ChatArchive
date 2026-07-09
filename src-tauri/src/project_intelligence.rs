use crate::importer::stable_id;
use crate::models::*;
use chrono::{Datelike, TimeZone, Utc};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

#[derive(Default)]
struct Seed {
    name: String,
    conversations: BTreeSet<String>,
    evidence: BTreeMap<String, (String, usize, f64)>,
}

const STOP_WORDS: &[&str] = &[
    "about",
    "after",
    "again",
    "archive",
    "build",
    "chat",
    "conversation",
    "create",
    "from",
    "help",
    "implementation",
    "into",
    "project",
    "that",
    "this",
    "using",
    "with",
];

pub fn normalize_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokens(value: &str) -> Vec<String> {
    normalize_name(value)
        .split_whitespace()
        .filter(|word| word.len() >= 3 && !STOP_WORDS.contains(word))
        .map(ToString::to_string)
        .collect()
}

fn add_seed(
    seeds: &mut HashMap<String, Seed>,
    name: &str,
    conversation_id: &str,
    evidence_type: &str,
    label: &str,
    weight: f64,
) {
    let normalized = normalize_name(name);
    if normalized.len() < 3 || STOP_WORDS.contains(&normalized.as_str()) {
        return;
    }
    let seed = seeds.entry(normalized).or_default();
    if seed.name.is_empty() {
        seed.name = name.trim().to_string();
    }
    seed.conversations.insert(conversation_id.to_string());
    let evidence = seed
        .evidence
        .entry(format!("{evidence_type}:{label}"))
        .or_insert((evidence_type.to_string(), 0, weight));
    evidence.1 += 1;
}

fn add_token_evidence(
    seeds: &mut HashMap<String, Seed>,
    text: &str,
    conversation_id: &str,
    evidence_type: &str,
    weight: f64,
) {
    for token in tokens(text) {
        add_seed(seeds, &token, conversation_id, evidence_type, text, weight);
    }
}

pub fn scan_projects(
    index: &ArchiveIndex,
    artifacts: &ArtifactIndex,
    knowledge: &KnowledgeState,
    current: &ProjectState,
) -> Vec<ProjectCandidate> {
    let mut seeds = HashMap::new();
    for conversation in &index.conversations {
        add_token_evidence(
            &mut seeds,
            &conversation.title,
            &conversation.id,
            "title",
            2.0,
        );
    }
    for collection in &knowledge.collections {
        for item in knowledge
            .collection_items
            .iter()
            .filter(|item| item.collection_id == collection.id)
        {
            add_seed(
                &mut seeds,
                &collection.name,
                &item.target.conversation_id,
                "collection",
                &collection.name,
                10.0,
            );
        }
    }
    for tag in &knowledge.tags {
        for link in knowledge
            .tag_links
            .iter()
            .filter(|link| link.tag_id == tag.id)
        {
            add_seed(
                &mut seeds,
                &tag.name,
                &link.target.conversation_id,
                "tag",
                &tag.name,
                4.0,
            );
        }
    }
    for item in &artifacts.documents {
        add_token_evidence(
            &mut seeds,
            &item.title,
            &item.base.conversation_id,
            "file",
            3.0,
        );
    }
    for item in &artifacts.assets {
        add_token_evidence(
            &mut seeds,
            &format!("{} {}", item.label, item.original),
            &item.base.conversation_id,
            "file",
            3.0,
        );
    }
    for item in &artifacts.code {
        add_token_evidence(
            &mut seeds,
            &item.base.search_text,
            &item.base.conversation_id,
            "artifact",
            1.0,
        );
    }

    let conversation_map = index
        .conversations
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<HashMap<_, _>>();
    let dismissed = current
        .dismissed_candidates
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let claimed = current
        .projects
        .iter()
        .map(|item| item.normalized_name.clone())
        .chain(
            current
                .aliases
                .iter()
                .map(|item| item.normalized_alias.clone()),
        )
        .collect::<HashSet<_>>();
    let mut candidates = Vec::new();
    for (normalized, seed) in seeds {
        if dismissed.contains(&normalized)
            || claimed.contains(&normalized)
            || seed.conversations.len() < 3
        {
            continue;
        }
        let mut months = BTreeSet::new();
        let mut first_time: Option<f64> = None;
        let mut last_time: Option<f64> = None;
        for id in &seed.conversations {
            if let Some(conversation) = conversation_map.get(id.as_str()) {
                if let Some(time) = conversation.update_time.or(conversation.create_time) {
                    first_time = Some(first_time.map_or(time, |value| value.min(time)));
                    last_time = Some(last_time.map_or(time, |value| value.max(time)));
                    if let Some(date) = Utc.timestamp_opt(time as i64, 0).single() {
                        months.insert((date.year(), date.month()));
                    }
                }
            }
        }
        if months.len() < 2 {
            continue;
        }
        let evidence = seed
            .evidence
            .values()
            .map(|(kind, count, weight)| ProjectEvidence {
                evidence_type: kind.clone(),
                label: format!("{} matches", count),
                weight: *weight * *count as f64,
            })
            .collect::<Vec<_>>();
        let score = seed.conversations.len() as f64 * 2.0
            + months.len() as f64
            + evidence.iter().map(|item| item.weight).sum::<f64>();
        candidates.push(ProjectCandidate {
            id: stable_id(&format!("project-candidate:{normalized}")),
            name: seed.name,
            normalized_name: normalized,
            score,
            first_time,
            last_time,
            month_count: months.len(),
            conversation_ids: seed.conversations.into_iter().collect(),
            evidence,
        });
    }
    candidates.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.name.cmp(&b.name))
    });
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_project_names() {
        assert_eq!(normalize_name("Command-Wizard_v0.3"), "command wizard v0 3");
    }

    fn fixture_index() -> ArchiveIndex {
        serde_json::from_value(serde_json::json!({
            "generatedAt":"2026-01-01", "sourcePath":"fixture",
            "totals":{"conversations":3,"visibleMessages":0,"hiddenMessages":0,"assets":0,"copiedAssets":0,"missingAssets":0,"externalAssets":0},
            "conversations":[
                {"id":"c1","title":"Aegis initial concept","slug":"c1","createTime":1754000000.0,"updateTime":1754000000.0,"createIso":null,"updateIso":null,"archived":false,"starred":false,"messageCount":1,"hiddenMessageCount":0,"codeBlockCount":0,"assetCount":0,"externalAssetCount":0,"snippet":"","searchText":""},
                {"id":"c2","title":"Aegis UI design","slug":"c2","createTime":1759276800.0,"updateTime":1759276800.0,"createIso":null,"updateIso":null,"archived":false,"starred":false,"messageCount":1,"hiddenMessageCount":0,"codeBlockCount":0,"assetCount":0,"externalAssetCount":0,"snippet":"","searchText":""},
                {"id":"c3","title":"Aegis v0.3.0","slug":"c3","createTime":1767225600.0,"updateTime":1767225600.0,"createIso":null,"updateIso":null,"archived":false,"starred":false,"messageCount":1,"hiddenMessageCount":0,"codeBlockCount":0,"assetCount":0,"externalAssetCount":0,"snippet":"","searchText":""}
            ]
        })).unwrap()
    }

    fn empty_artifacts() -> ArtifactIndex {
        serde_json::from_value(serde_json::json!({"generatedAt":"2026-01-01","sourcePath":"fixture","totals":{"code":0,"assets":0,"documents":0,"links":0},"languageCounts":{},"code":[],"assets":[],"documents":[],"links":[]})).unwrap()
    }

    #[test]
    fn detects_balanced_candidate_and_respects_curation() {
        let candidates = scan_projects(
            &fixture_index(),
            &empty_artifacts(),
            &KnowledgeState::default(),
            &ProjectState::default(),
        );
        let aegis = candidates
            .iter()
            .find(|item| item.normalized_name == "aegis")
            .unwrap();
        assert_eq!(aegis.conversation_ids.len(), 3);
        assert!(aegis.month_count >= 2);

        let dismissed = ProjectState {
            dismissed_candidates: vec!["aegis".to_string()],
            ..ProjectState::default()
        };
        assert!(!scan_projects(
            &fixture_index(),
            &empty_artifacts(),
            &KnowledgeState::default(),
            &dismissed
        )
        .iter()
        .any(|item| item.normalized_name == "aegis"));

        let aliased = ProjectState {
            aliases: vec![ProjectAlias {
                project_id: 1,
                alias: "Aegis".to_string(),
                normalized_alias: "aegis".to_string(),
            }],
            ..ProjectState::default()
        };
        assert!(!scan_projects(
            &fixture_index(),
            &empty_artifacts(),
            &KnowledgeState::default(),
            &aliased
        )
        .iter()
        .any(|item| item.normalized_name == "aegis"));
    }
}
