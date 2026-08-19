interface TrackArtworkProps {
  cls: Record<string, string>;
}

/**
 * The approved SDP-Landing track artwork (the #trackReveal/#trackScene SVG):
 * a rotated-ellipse oval with 8 lanes, start line, distance marks, lane numbers
 * and a stylised javelin throw sector. Shared by the hero reveal and the cinematic
 * scroll track, which each supply their own CSS-module class map so the same
 * geometry can be painted differently per context (mirroring the mockup, which
 * clones this SVG into the cinematic chase-camera stage).
 */
export function TrackArtwork({ cls }: TrackArtworkProps) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="presentation">
      <defs>
        <linearGradient id="athloraLaneKey" gradientUnits="userSpaceOnUse" x1="360" y1="770" x2="1320" y2="210">
          <stop offset="0" stopColor="#0A536A" />
          <stop offset="0.38" stopColor="#55C9DB" />
          <stop offset="0.60" stopColor="#E8FEFF" />
          <stop offset="0.73" stopColor="#8AE9F2" />
          <stop offset="1" stopColor="#176B86" />
        </linearGradient>
        <linearGradient id="athloraLaneHot" gradientUnits="userSpaceOnUse" x1="330" y1="790" x2="1280" y2="190">
          <stop offset="0" stopColor="#2B869B" />
          <stop offset="0.43" stopColor="#A7F5FA" />
          <stop offset="0.59" stopColor="#FFFFFF" />
          <stop offset="0.72" stopColor="#BFFBFE" />
          <stop offset="1" stopColor="#3298B0" />
        </linearGradient>
        <linearGradient id="athloraTrackRim" gradientUnits="userSpaceOnUse" x1="420" y1="760" x2="1250" y2="230">
          <stop offset="0" stopColor="#00364B" />
          <stop offset="0.46" stopColor="#1686A1" />
          <stop offset="0.62" stopColor="#55D3E2" />
          <stop offset="1" stopColor="#06465E" />
        </linearGradient>
      </defs>
      <g transform="rotate(-8 800 450)">
        <ellipse className={cls.shadowBed} cx="815" cy="514" rx="680" ry="310" />
        <ellipse className={cls.bed} cx="815" cy="500" rx="680" ry="310" />
        <ellipse className={cls.bedHi} cx="815" cy="494" rx="680" ry="310" />

        <ellipse className={cls.infieldShadow} cx="815" cy="510" rx="574" ry="212" />
        <ellipse className={cls.infield} cx="815" cy="500" rx="574" ry="212" />
        <ellipse className={cls.infieldHi} cx="815" cy="496" rx="566" ry="204" />

        <g>
          <g transform="translate(0 6)">
            <path className={cls.throwDepth} d="M1070 486 L491 336" />
            <path className={cls.throwDepth} d="M1070 514 L491 664" />
            <path className={cls.throwDepth} d="M886.2 548.8 A195 195 0 0 1 886.2 451.2" />
            <path className={cls.throwDepth} d="M823.3 565.0 A260 260 0 0 1 823.3 435.0" />
            <path className={cls.throwDepth} d="M760.3 581.3 A325 325 0 0 1 760.3 418.7" />
            <path className={cls.throwDepth} d="M697.4 597.5 A390 390 0 0 1 697.4 402.5" />
            <path className={cls.throwDepth} d="M634.5 613.8 A455 455 0 0 1 634.5 386.2" />
            <path className={cls.throwDepth} d="M571.5 630.0 A520 520 0 0 1 571.5 370.0" />
            <path className={cls.throwDepth} d="M508.6 646.3 A585 585 0 0 1 508.6 353.7" />
            <path className={cls.throwArcDepth} d="M1071 482 Q1059 500 1071 518" />
            <rect className={cls.runwayShadow} x="1072" y="483" width="244" height="34" rx="4" />
          </g>

          <rect className={cls.runway} x="1072" y="483" width="244" height="34" rx="4" />
          <path className={cls.throwLineMajor} d="M1070 486 L491 336" />
          <path className={cls.throwLineMajor} d="M1070 514 L491 664" />
          <path className={cls.throwGuide} d="M886.2 548.8 A195 195 0 0 1 886.2 451.2" />
          <path className={cls.throwGuideMajor} d="M823.3 565.0 A260 260 0 0 1 823.3 435.0" />
          <path className={cls.throwGuide} d="M760.3 581.3 A325 325 0 0 1 760.3 418.7" />
          <path className={cls.throwGuideMajor} d="M697.4 597.5 A390 390 0 0 1 697.4 402.5" />
          <path className={cls.throwGuide} d="M634.5 613.8 A455 455 0 0 1 634.5 386.2" />
          <path className={cls.throwGuideMajor} d="M571.5 630.0 A520 520 0 0 1 571.5 370.0" />
          <path className={cls.throwGuide} d="M508.6 646.3 A585 585 0 0 1 508.6 353.7" />
          <path className={cls.throwArc} d="M1071 482 Q1059 500 1071 518" />
          <path className={cls.throwGuide} d="M1066 500 L500 500" />
          <text className={cls.throwNum} x="811" y="488">40</text><text className={cls.throwUnit} x="836" y="488">m</text>
          <text className={cls.throwNum} x="746" y="488">50</text><text className={cls.throwUnit} x="771" y="488">m</text>
          <text className={cls.throwNum} x="681" y="488">60</text><text className={cls.throwUnit} x="706" y="488">m</text>
          <text className={cls.throwNum} x="616" y="488">70</text><text className={cls.throwUnit} x="641" y="488">m</text>
          <text className={cls.throwNum} x="551" y="488">80</text><text className={cls.throwUnit} x="576" y="488">m</text>
          <text className={cls.throwNum} x="486" y="488">90</text><text className={cls.throwUnit} x="511" y="488">m</text>
        </g>

        <g transform="translate(0 7)">
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="768" ry="398" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="746" ry="376" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="724" ry="354" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="702" ry="332" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="680" ry="310" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="658" ry="288" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="636" ry="266" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="614" ry="244" />
          <ellipse className={cls.laneDepth} cx="815" cy="500" rx="592" ry="222" />
          <path className={cls.startDepth} d="M1451 293 L1517 647" />
        </g>

        <ellipse className={cls.laneHot} cx="815" cy="500" rx="768" ry="398" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="746" ry="376" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="724" ry="354" />
        <ellipse className={cls.laneHot} cx="815" cy="500" rx="702" ry="332" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="680" ry="310" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="658" ry="288" />
        <ellipse className={cls.laneHot} cx="815" cy="500" rx="636" ry="266" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="614" ry="244" />
        <ellipse className={cls.lane} cx="815" cy="500" rx="592" ry="222" />

        <path className={cls.startLine} d="M1451 293 L1517 647" />
        <path className={cls.mark} d="M1357 260 L1420 630" />
        <path className={cls.mark} d="M1267 242 L1324 610" />
        <path className={cls.mark} d="M1177 232 L1228 592" />
        <path className={cls.mark} d="M1090 230 L1135 574" />
        <path className={cls.mark} d="M1005 236 L1044 556" />

        <g transform="translate(1390 410) rotate(77)">
          <text className={cls.laneNum} x="0" y="0">1</text>
          <text className={cls.laneNum} x="0" y="23">2</text>
          <text className={cls.laneNum} x="0" y="46">3</text>
          <text className={cls.laneNum} x="0" y="69">4</text>
          <text className={cls.laneNum} x="0" y="92">5</text>
          <text className={cls.laneNum} x="0" y="115">6</text>
          <text className={cls.laneNum} x="0" y="138">7</text>
          <text className={cls.laneNum} x="0" y="161">8</text>
        </g>
      </g>
    </svg>
  );
}