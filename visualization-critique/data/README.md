# Data provenance

Downloaded September 26, 2026. These are unmodified CSV exports from the HistData package, distributed through Vincent Arel-Bundock's Rdatasets project.

| Local file | Source | Records |
| --- | --- | --- |
| troops.csv | https://vincentarelbundock.github.io/Rdatasets/csv/HistData/Minard.troops.csv | 51 |
| temperature.csv | https://vincentarelbundock.github.io/Rdatasets/csv/HistData/Minard.temp.csv | 9 |
| cities.csv | https://vincentarelbundock.github.io/Rdatasets/csv/HistData/Minard.cities.csv | 20 |

Documentation: https://friendly.github.io/HistData/reference/Minard.html

Original image and translated caption: https://commons.wikimedia.org/wiki/File:Minard.png

## Interpretation

- `rownames` is the source row identifier, not a date. Records remain in source order within each direction and group.
- `survivors` is displayed as “troops recorded.” The data are a simplified transcription of the graphic, not an independently validated count of deaths. Transfers and detachments complicate interpretation.
- `direction` is A (advance) or R (retreat). `group` separates three digitized route paths. Group 1 has 35 records, group 2 has 10, and group 3 has 6.
- The initial group values are 340,000 + 60,000 + 22,000 = 422,000. The default chart shows only group 1. Do not sum arbitrary later records across groups: locations and observation stages differ, and routes rejoin.
- `long` and `lat` are source coordinates in degrees. The chart uses longitude as a shared position axis, not time or traveled distance. City guides indicate longitude, not an exact troop/city match.
- Temperature values are in Réaumur according to the original caption. The chart converts them using Celsius = Réaumur × 1.25. The minimum recorded −30 °Ré becomes −37.5 °C.
- The fifth temperature record has no date. It remains “Date not recorded”; no date is inferred from the `days` column. The chart does not use `days` as a cumulative timeline.
- Temperature observations are campaign context, not measurements independently recorded for each group. They stay unchanged when the group selector changes.
- The HistData documentation contains references to 1815. The historical graphic itself is dated 1869 and titled for the campaign of 1812–1813; this project follows the original graphic's dates.
- No interpolation, smoothing, inferred dates, coordinate matching, or aggregation is added to the CSV files. Lines visually connect successive source observations; intermediate positions are not new measurements.

## Image

`../assets/minard-original.png` is the public-domain original from https://upload.wikimedia.org/wikipedia/commons/2/29/Minard.png . It is included with attribution rather than replaced by a modern redrawing.
