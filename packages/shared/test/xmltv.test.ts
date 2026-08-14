import { describe, expect, it } from 'vitest'

import { parseXmltv } from '../src/xmltv'

const UTC_WALL_CLOCK = ({
  year,
  month,
  day,
  hour,
  minute,
  second,
}: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}) => Date.UTC(year, month - 1, day, hour, minute, second)

describe('parseXmltv', () => {
  it('normalizes channel and programme metadata while preserving string identifiers', () => {
    const parsed = parseXmltv(
      `<?xml version="1.0"?>
      <tv>
        <channel id="001">
          <display-name>Haber 1</display-name>
          <display-name>Haber Bir</display-name>
          <icon src="https://img.example/haber.png"/>
        </channel>
        <programme start="20260814120000 +0300" stop="20260814130000 +0300" channel="001">
          <title>Öğle Haberleri</title>
          <sub-title>Gündem</sub-title>
          <desc>Günün gelişmeleri</desc>
          <category>Haber</category>
          <category>Canlı</category>
          <icon src="https://img.example/program.png"/>
        </programme>
      </tv>`,
      { localWallClockToEpoch: UTC_WALL_CLOCK },
    )

    expect(parsed.channels).toEqual([
      {
        id: '001',
        displayNames: ['Haber 1', 'Haber Bir'],
        iconUrl: 'https://img.example/haber.png',
      },
    ])
    expect(parsed.programmes).toEqual([
      {
        channelId: '001',
        startAt: Date.UTC(2026, 7, 14, 9, 0, 0),
        stopAt: Date.UTC(2026, 7, 14, 10, 0, 0),
        title: 'Öğle Haberleri',
        subTitle: 'Gündem',
        description: 'Günün gelişmeleri',
        categories: ['Haber', 'Canlı'],
        iconUrl: 'https://img.example/program.png',
      },
    ])
    expect(parsed.warnings).toEqual([])
  })

  it('uses the injected local wall-clock resolver when XMLTV omits an offset', () => {
    const parsed = parseXmltv(
      `<tv>
        <channel id="local"><display-name>Local</display-name></channel>
        <programme start="20260814123000" stop="20260814130000" channel="local">
          <title>Local Show</title>
        </programme>
      </tv>`,
      { localWallClockToEpoch: UTC_WALL_CLOCK },
    )

    expect(parsed.programmes[0]).toMatchObject({
      startAt: Date.UTC(2026, 7, 14, 12, 30, 0),
      stopAt: Date.UTC(2026, 7, 14, 13, 0, 0),
    })
  })

  it('infers a missing stop from the next programme and defaults the final stop to 30 minutes', () => {
    const parsed = parseXmltv(
      `<tv>
        <channel id="c1"><display-name>C1</display-name></channel>
        <programme start="20260814100000 +0000" channel="c1"><title>A</title></programme>
        <programme start="20260814110000 +0000" channel="c1"><title>B</title></programme>
      </tv>`,
    )

    expect(parsed.programmes).toEqual([
      expect.objectContaining({
        title: 'A',
        stopAt: Date.UTC(2026, 7, 14, 11, 0, 0),
      }),
      expect.objectContaining({
        title: 'B',
        stopAt: Date.UTC(2026, 7, 14, 11, 30, 0),
      }),
    ])
    expect(parsed.warnings.map(({ code }) => code)).toEqual([
      'inferred-stop',
      'default-stop',
    ])
  })

  it('skips malformed rows, keeps valid rows, and deduplicates programmes', () => {
    const parsed = parseXmltv(
      `<tv>
        <channel id="good"><display-name>Good</display-name></channel>
        <channel id=""><display-name>Bad</display-name></channel>
        <programme start="bad" channel="good"><title>Bad Start</title></programme>
        <programme start="20260814100000 +0000" stop="20260814103000 +0000" channel="good"><title>Same</title></programme>
        <programme start="20260814100000 +0000" stop="20260814103000 +0000" channel="good"><title>Same</title></programme>
      </tv>`,
    )

    expect(parsed.channels).toHaveLength(1)
    expect(parsed.programmes).toHaveLength(1)
    expect(parsed.programmes[0]?.title).toBe('Same')
    expect(parsed.warnings.map(({ code }) => code)).toContain('invalid-channel')
    expect(parsed.warnings.map(({ code }) => code)).toContain(
      'invalid-programme',
    )
  })
})
