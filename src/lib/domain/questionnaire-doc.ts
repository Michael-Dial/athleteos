// Reference shown beside the JSON editor so the format is self-documenting.
export const DEF_DOC = `{
  "slug": "lowercase-with-dashes",
  "name": "Shown in lists",
  "description": "optional",
  "kind": "wellness | custom",        // wellness feeds the daily composite and readiness
  "schedule": "daily | weekly | adhoc",
  "items": [
    { "key": "fatigue", "label": "Fatigue", "type": "scale",
      "min": 1, "max": 5, "step": 1, "lowLabel": "Always tired", "highLabel": "Very fresh",
      "higherIsBetter": true, "required": true },
    { "key": "body_mass", "label": "Body mass", "type": "number", "unit": "kg", "min": 30, "max": 250, "step": 0.1 },
    { "key": "sick", "label": "Ill?", "type": "boolean" },
    { "key": "niggle", "label": "Niggle", "type": "choice", "options": ["None", "Minor", "Stopped training"] },
    { "key": "notes", "label": "Notes", "type": "text" }
  ]
}
// Scale items count toward the wellness composite unless "wellness": false.
// Number items count only with "wellness": true and both min and max set.
// Changing items bumps the version; past answers keep the items they were asked with.`;
