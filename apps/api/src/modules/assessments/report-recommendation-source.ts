/**
 * Where a recommendation on a report came from. Every recommendation today is written by a person, so
 * "MANUAL" is the only source the API records. The source is stored next to the text (on drafts and on
 * each signed version) and is sealed with the sign-off, so a future assisted source can be told apart from
 * a person's own words without guessing afterwards. Add a value here only together with the feature that
 * produces it, a label for readers of the report, and a test.
 */
export const RECOMMENDATION_SOURCES = ["MANUAL"] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

/** What the sign-off and draft routes record: the person at the keyboard wrote it. */
export const MANUAL_RECOMMENDATION: RecommendationSource = "MANUAL";
