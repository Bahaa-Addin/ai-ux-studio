/**
 * Normalized content model for https://web.vodafone.com.eg/en/services
 *
 * This is the single source of truth for BOTH the Original view and every AIXC
 * experience. Renderers read from here; Gemini only ever sees stable IDs plus
 * short text and never authors any of these values.
 *
 * Provenance
 * - Text and images: captured from the live page on 2026-04-21 (see docs/design-system.md).
 * - Links, hero heading and the "Roaming Services" title: re-checked against the live
 *   page on 2026-11-02.
 * - Copy is kept exactly as published, including source typos and slug-like titles
 *   ("International standarad rates", "visa-appointment", "park-your-line",
 *   "Vodafone-advertising") and irregular spacing ("line , your").
 *
 * Known source anomalies (kept out of the demo deliberately, see README):
 * - The live "Stay In Control" markup contains a 5th card titled "Balance transfer"
 *   that links to /en/shokran-services. It duplicates the 1st card's title, and the
 *   captured rendering shows four cards, so it is not modelled.
 * - The live "Edfa3ly Shokran" link is malformed ("https://web.vodafone.com.egen/...").
 *   It is normalised below to the URL every sibling Shokran card uses.
 *
 * Field notes
 * - `cta.label === null` means the source card is itself the link (no separate CTA text).
 * - `cta.href === null` means the source provides no destination; renderers must not
 *   invent one. Great Entertainment cards use the live page's shared Ana Vodafone
 *   flow, except Play&Win which has a dedicated Vodafone page.
 * - `image.width/height` are the intrinsic pixel sizes of the local asset. Renderers use
 *   them to pick crops and avoid upscaling small images.
 */

const VF = 'https://web.vodafone.com.eg'
const ANA_VODAFONE = 'https://vf.eg/anavodafone'
const img = (file, width, height) => ({ src: `/ai-ux-studio/services/assets/images/${file}`, width, height })

export const vodafoneServicesPage = {
  pageId: 'vodafone-services',
  sourceUrl: `${VF}/en/services`,
  capturedOn: '2026-04-21',
  linksVerifiedOn: '2026-11-02',
  title: 'Vodafone Services',
  intro: 'Manage your line , your payment, balance, and all the services you need',
  heroImage: img('hero-banner.jpg', 1920, 350),

  sections: [
    {
      id: 'cash',
      title: 'Vodafone Cash',
      description: null,
      cta: null,
      aside: null,
      items: [
        {
          id: 'vodafone-cash',
          title: 'Vodafone Cash',
          description:
            'Vodafone Cash is an E-Wallet provided by Vodafone to make your life easier and run all your errands with a click.',
          image: { ...img('vf-cash.png', 218, 240), fit: 'contain' },
          cta: { label: 'View more', href: `${VF}/en/vodafone-cash` },
        },
      ],
    },
    {
      id: 'stay-in-control',
      title: 'Stay In Control',
      description: 'Manage your line , your payment, balance, and all the services you need',
      cta: null,
      aside: null,
      items: [
        {
          id: 'balance-transfer',
          title: 'Balance transfer',
          description: null,
          image: img('transfer.png', 230, 170),
          cta: { label: 'View more', href: `${VF}/spa/balanceTransfer` },
        },
        {
          id: 'end-of-call-notifications',
          title: 'End of Call notifications',
          description: null,
          image: img('end-call.png', 230, 170),
          cta: { label: 'View more', href: `${VF}/en/end-of-call` },
        },
        {
          id: 'calls-services',
          title: 'Calls services',
          description: null,
          image: img('call-services.png', 510, 240),
          cta: { label: 'View more', href: `${VF}/spa/vodafone-services` },
        },
        {
          id: 'international-balance-transfer',
          title: 'International balance transfer',
          description: null,
          image: img('international-transfer.png', 230, 170),
          cta: { label: 'View more', href: `${VF}/en/international-balance-transfer` },
        },
      ],
    },
    {
      id: 'call-and-connect-abroad',
      title: 'Call & Connect abroad',
      description: null,
      cta: null,
      aside: null,
      items: [
        {
          id: 'roaming',
          title: 'Roaming Services',
          description:
            'Stay connected with your family and loved ones with calls, SMS and unlimited Internet with no worries and at the best rates',
          image: img('roaming.png', 350, 150),
          cta: { label: null, href: `${VF}/spa/roaming` },
        },
        {
          id: 'visiting-egypt',
          title: 'Visiting Egypt',
          description:
            "Roam with Vodafone, the world's mobile leader, while visiting Egypt and enjoy a variety of extraordinary telecommunication solutions.",
          image: img('visiting-egypt.png', 350, 150),
          cta: { label: null, href: `${VF}/en/visiting-egypt` },
        },
        {
          id: 'international-standard-rates',
          title: 'International standarad rates',
          description: 'Stay in connected with anyone everywhere with our international calling',
          image: img('international-rates.png', 350, 150),
          cta: { label: null, href: `${VF}/en/international-calls` },
        },
      ],
    },
    {
      id: 'great-entertainment',
      title: 'Great Entertainment',
      description: 'Enjoy entertainment services from Vodafone and select your favorite',
      cta: { label: 'Download Ana Vodafone App', href: ANA_VODAFONE },
      aside: {
        title: 'Download Ana Vodafone',
        description: 'Scan the QR to enjoy the service',
        image: img('ana-vodafone-qr.png', 330, 330),
      },
      items: [
        {
          id: 'mo-salah-world',
          title: 'Mo Salah World',
          description: 'Subscribe and stay updated with all news &videos of M.Salah',
          image: img('mo-salah-world.png', 200, 430),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
        {
          id: '3alam-mama',
          title: '3alam Mama',
          description: 'Get information from the moment of pregnancy till your child is older',
          image: img('3alam-mama.png', 200, 200),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
        {
          id: 'henedy-world',
          title: 'Henedy World',
          description: "Subscribe &stay connected with all Henedy's news, behind the scenes ,memes and more",
          image: img('henedy-world.png', 200, 200),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
        {
          id: 'vf-play',
          title: 'VF Play',
          description: 'Enjoy the ultimate gaming experience with VF Play for free',
          image: img('vf-play.png', 200, 200),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
        {
          id: '90-mins',
          title: '90 Mins',
          description: 'Know the latest news of the European league',
          image: img('90-mins.png', 200, 200),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
        {
          id: 'play-and-win',
          title: 'Play&Win',
          description: 'Answer 10 questions correctly and win 10,000 pounds',
          image: img('play-win.png', 430, 200),
          cta: { label: 'Subscribe now', href: `${VF}/en/play-win` },
        },
        {
          id: 'el-hadaba-world',
          title: 'El Hadaba World',
          description: "Know Amr Diab's latest news",
          image: img('amr-diab.png', 200, 430),
          cta: { label: 'Subscribe now', href: ANA_VODAFONE },
        },
      ],
    },
    {
      id: 'shokran-services',
      title: 'Shokran services',
      description: null,
      cta: null,
      aside: null,
      items: [
        {
          id: 'sallefny-shokran',
          title: 'Sallefny Shokran',
          description: 'Now you can borrow from 4 LE up to 32LE depending on your usage',
          image: img('sallefny-shokran.png', 230, 170),
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
        {
          id: 'kallemny-shokran',
          title: 'Kallemny Shokran',
          description: 'Now get 2 free “Kallemny Shokran” messages per day to Vodafone numbers.',
          image: img('kallemny-shokran.png', 230, 170),
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
        {
          id: '3alnota-shokran',
          title: '3alnota Shokran',
          description: "Your calls aren't finished even if you run out of balance",
          image: img('3alnota-shokran.png', 230, 170),
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
        {
          id: 'edfa3ly-shokran',
          title: 'Edfa3ly Shokran',
          description: 'Now you can call any Vodafone number at his expenses.',
          image: img('edfa3ly-shokran.png', 230, 170),
          // Published href is malformed ("web.vodafone.com.egen/shokran-services"); normalised.
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
        {
          id: 'rennely-shokran',
          title: 'Rennely Shokran',
          description: 'If your credit finished, your calls do not. With "Rennely Shokran" service',
          image: img('rennely-shokran.png', 230, 170),
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
        {
          id: 'wasalny-shokran',
          title: 'Wasalny Shokran',
          description: 'With Vodafone, don’t let the traffic stop you.',
          image: img('wasalny-shokran.png', 230, 170),
          cta: { label: null, href: `${VF}/en/shokran-services` },
        },
      ],
    },
    {
      id: 'other-services',
      title: 'Enjoy other services',
      description: null,
      cta: null,
      aside: null,
      items: [
        {
          id: 'mini-call',
          title: 'Mini Call',
          description:
            'Minicall is a service that allows you to record a voice message and send it to any mobile number in Egypt.',
          image: img('mini-call.png', 350, 150),
          cta: { label: null, href: `${VF}/en/mini-call` },
        },
        {
          id: 'multi-sim',
          title: 'Multi sim',
          description: 'NOW YOU CAN! Enjoy the best network with your same number',
          image: img('multi-sim.png', 350, 150),
          cta: { label: null, href: `${VF}/en/multi-sim` },
        },
        {
          id: 'short-numbers',
          title: 'Short numbers',
          description:
            'Send a song to a friend, listen to the latest music or change the logo and ringtone of your phone',
          image: img('short-numbers.png', 350, 150),
          cta: { label: null, href: `${VF}/en/short-numbers` },
        },
        {
          id: 'visa-appointment',
          title: 'visa-appointment',
          description:
            'With the Visa Appointment service, you can find out the procedures for visa applications, and schedule appointments for visa interviews.',
          image: img('visa-appointment.png', 350, 150),
          cta: { label: null, href: `${VF}/en/visa-appointment` },
        },
        {
          id: 'park-your-line',
          title: 'park-your-line',
          description: 'Park your line temporarily with Vodafone',
          image: img('park-your-line.png', 350, 150),
          cta: { label: null, href: `${VF}/en/park-your-line` },
        },
        {
          id: 'vodafone-advertising',
          title: 'Vodafone-advertising',
          description:
            "Find out about the latest offers and discounts available at your favorite stores in Egypt with Vodafone's personalized Mobile Advertising service!",
          image: img('vodafone-advertising.png', 350, 150),
          cta: { label: null, href: `${VF}/en/vodafone-advertising` },
        },
        {
          id: 'vodafone-arabeety',
          title: 'Vodafone Arabeety Service',
          description:
            'Vodafone in cooperation with ETIT company is offering a real-time tracking service for your vehicle anywhere & anytime.',
          image: img('vodafone-arabeety.png', 350, 150),
          cta: { label: null, href: `${VF}/en/3arabety` },
        },
        {
          id: 'join-without-changing-number',
          title: 'Join us without changing your number',
          description: 'Now you can enjoy Vodafone network with your same number.',
          image: img('join-without-changing-number.png', 350, 150),
          cta: { label: null, href: `${VF}/en/join-us-without-changing-your-number` },
        },
      ],
    },
  ],

  closingPromotion: {
    id: 'ana-vodafone-app',
    title: 'Download Ana Vodafone App',
    lead: 'And Manage all your services',
    description: 'Join Vodafone and get the best services designed for you !',
    storesLabel: 'Available on:',
    stores: [
      { label: 'Apple App Store', icon: 'icon-apple', href: 'https://apps.apple.com/eg/app/ana-vodafone/id437564823' },
      {
        label: 'Google Play',
        icon: 'icon-android',
        href: 'https://play.google.com/store/apps/details?id=com.emeint.android.myservices&hl=en&gl=US',
      },
      { label: 'Huawei AppGallery', icon: 'icon-huawei', href: 'https://appgallery.huawei.com/app/C102084135' },
    ],
    qr: { title: 'Scan QR CODE & Download', image: img('cta-qr-code.png', 330, 330) },
  },
}
