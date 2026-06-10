# Contributing to SHADES

## Adding sunglasses to the database

The catalog lives in `data/sunglasses.json`. Each entry must follow this schema:

```json
{
  "id": "brand-model-slug",
  "brand": "Brand Name",
  "model": "Model Name",
  "style": "classic",
  "price": 150,
  "face_shapes": ["oval", "heart"],
  "material": "metal",
  "link": "https://...",
  "image_url": "https://..."
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique kebab-case slug, e.g. `ray-ban-aviator-classic` |
| `brand` | string | yes | Brand name as it appears on the product |
| `model` | string | yes | Model name as it appears on the product |
| `style` | string | yes | One of: `classic`, `sporty`, `trendy`, `minimalist` |
| `price` | number | yes | USD retail price as an integer |
| `face_shapes` | array | yes | One or more of: `oval`, `round`, `square`, `heart`, `oblong` |
| `material` | string | yes | One of: `plastic`, `metal`, `rimless` |
| `link` | string | yes | Direct product URL — must be a live, purchasable link |
| `image_url` | string | no | Direct image URL; leave as `""` if unavailable |

### Price tiers (for reference)

- Under $50
- $50–150
- $150–300
- $300+

### Steps to submit

1. Fork the repository
2. Add your entry (or entries) to `data/sunglasses.json` — keep the array sorted by `id`
3. Verify the `link` resolves to a live product page
4. Open a pull request with the title: `data: add <brand> <model>`

## Reporting bugs

Open a GitHub issue with steps to reproduce, expected behavior, and actual behavior.

## Suggesting features

Open a GitHub issue tagged `enhancement` with a description of the use case.
