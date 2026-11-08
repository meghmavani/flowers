# flowers

Flowers drawn in animated ASCII, with a different one each day.

**See today's flower:** https://meghmavani.github.io/flowers/

Each flower grows from a bud and blooms when the page opens. Click or press R to replay it.

## The flowers

| Page | What it is | Color |
| --- | --- | --- |
| [Tulips](https://meghmavani.github.io/flowers/flowers/tulips.html) | A bouquet of ten | One tulip at a time fades to a new color |
| [Rose](https://meghmavani.github.io/flowers/flowers/rose.html) | A single rose | Fades between white and pinks |
| [Sunflower](https://meghmavani.github.io/flowers/flowers/sunflower.html) | A single sunflower | Always yellow |
| [Lilies](https://meghmavani.github.io/flowers/flowers/lilies.html) | A mixed bouquet | Fixed colors |

## How the daily flower works

`index.html` works out today's flower from the date and shows it, so there's no server or scheduled job. The order is random, but everyone gets the same flower on the same day. Each flower appears once before any repeats, and the same one never shows two days running. The flower changes at the viewer's local midnight.

## Adding a flower

1. Put the new page in `flowers/`, for example `flowers/daisy.html`.
2. Add its name to the `pages` list near the top of the script in `index.html`.
3. Commit and push. The site updates within a minute or two.

Adding a flower reshuffles the upcoming order.

## Running it locally

Open `index.html` in a browser, or open any page in `flowers/` directly. You need an internet connection because the pages load [PixiJS](https://pixijs.com/) from a CDN.
