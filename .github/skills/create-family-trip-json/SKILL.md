---
name: create-family-trip-json
description: 'Create, edit, or validate a FamilyTrip travel itinerary JSON file. Use when asked to make a trip plan, itinerary, .trip.json, or travel-plan JSON for the FamilyTrip app.'
argument-hint: 'Destination, dates, travelers, preferences, and budget'
---

# Create FamilyTrip JSON

Create a practical itinerary that can be opened by the FamilyTrip app. Treat user-provided details as authoritative; distinguish estimates from confirmed bookings and do not invent booking references, opening hours, fares, or other facts. If research tools are available and the user expects current recommendations, verify time-sensitive details and mention uncertainty in activity notes.

## Workflow

1. Identify the destination, inclusive travel dates, number and needs of travelers, interests, pace, budget, transport, and other constraints from the request or existing trip file. Make sensible, clearly stated assumptions for non-critical gaps; do not block on optional details.
2. Inspect a current sample in `examples/` and check `CURRENT_SCHEMA_VERSION` in `app.js` before creating a new file. Match the app's current `FamilyTrip` format and conventions rather than guessing a schema version.
3. Build one day per calendar date from `startDate` through `endDate`, inclusive. Order activities chronologically, allow realistic travel and meal breaks, and avoid scheduling activities that cannot reasonably fit together. A multi-day journey may include a day with no activities when appropriate.
4. Write only valid JSON to the requested path. If no path is specified, use a descriptive filename ending in `.trip.json` under `examples/`. Do not put Markdown fences, comments, or explanatory prose inside the JSON file.
5. Validate JSON syntax and check the structure and itinerary against the checklist below. Report estimates and assumptions outside the file when useful.

## File shape

Use this top-level structure:

```json
{
  "format": "FamilyTrip",
  "schemaVersion": 10,
  "trip": {
    "name": "Descriptive trip name",
    "destination": "City or region",
    "startDate": "2026-12-18",
    "endDate": "2026-12-20",
    "members": 4,
    "days": [
      {
        "title": "Day theme",
        "startTime": "09:00",
        "activities": []
      }
    ]
  }
}
```

The version above is illustrative only: use the version currently declared in `app.js`. Keep dates in `YYYY-MM-DD` form and times in 24-hour `HH:mm` form. The number of day entries should equal the inclusive date span. Include a non-empty day title, a valid `startTime`, and an `activities` array for each day.

Each activity should have a concise `title` and useful `detail`. Include `cost` as a non-negative number and `category` when recording an expense; use `0` for a known free activity and omit cost fields only when cost is intentionally unrecorded. Common categories are `交通费`, `机票`, `住宿费`, `旅行物品`, `餐饮费`, `门票`, and `其他`. Explicitly set `currency` when the amount is not in CNY, and use `costMode: "perPerson"` only when the amount is per traveler; otherwise use `costMode: "total"`.

## Activity types

Use the app's supported `type` values:

- `activity` (or omit `type`): ordinary sightseeing, meals, and other timed plans.
- `transport`: timed travel; provide `fromLocation` and `toLocation` when known.
- `overnightTransport`: travel that crosses midnight; include start `time`, `duration`, and route when known.
- `waiting`: a timed buffer or wait.
- `purchase`: an untimed shopping or supplies item.
- `accommodation`: lodging/check-in; place it last in that day's activities because the app moves accommodation entries to the end.

For timed activities, include `time` in `HH:mm`, positive `duration` in minutes, and normally `timeLocked: true` when the stated start time is intentional. For untimed `purchase` and `accommodation` entries, omit `time` and `duration`. Avoid setting internal UI-derived fields such as `hasTime`, `completed`, or `id` unless editing an existing file requires preserving them.

## Final checks

- The file parses as JSON and has `format: "FamilyTrip"`, the current schema version, and a `trip` object.
- `trip.name`, `destination`, ISO start/end dates, positive integer `members`, and non-empty `days` are present.
- The dates are valid and ordered; the day count matches the inclusive trip length.
- Every day has `title`, `startTime`, and an `activities` array. Every activity has a title; times and durations are valid when applicable.
- Activities are in a plausible order; transit has enough time, midnight-crossing journeys use `overnightTransport`, and accommodation is last each day.
- Costs are non-negative numbers with sensible categories and a consistent, explicit currency basis. Clearly label uncertain costs as estimates in `detail`.
- Do not include invented user personal data, credentials, or unsupported schema fields.

For concrete examples covering the activity types, see [activity-types.trip.json](../../../examples/activity-types.trip.json).
