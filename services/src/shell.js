/**
 * Protected page shell: the Vodafone header, navigation, footer and icon sprite.
 *
 * AIXC never re-renders or restyles anything produced here. Only the content
 * inside <main> (#source-content / #experience-output) is replaceable.
 * Markup is generated from static, local data in this file.
 */

import { lang, t } from './i18n.js'

const VF = 'https://web.vodafone.com.eg'

/** Public destinations from the live page, with stale links mapped to current official equivalents. */
export const shellLinks = {
  home: `${VF}/en/home`,
  language: `${VF}/ar/services`,
  search: `${VF}/spa/search`,
  topNav: [
    { label: 'Personal', href: `${VF}/en/home`, active: true },
    { label: 'Business', href: `${VF}/en/business` },
    { label: 'ڤودافون مصر', href: `${VF}/en/vodafone-egypt1` },
    { label: 'Network Coverage Map', href: `${VF}/spa/NetworkCoverageChecker` },
    { label: 'Vodafone Egypt Foundation', href: `${VF}/en/foundation-home` },
  ],
  mainNav: [
    { label: 'Shop', href: 'https://eshop.vodafone.com.eg/en/' },
    { label: 'Services', href: `${VF}/en/services` },
    { label: 'Promotions', href: `${VF}/en/promotions` },
  ],
  social: [
    { label: 'Facebook', icon: 'icon-facebook', href: 'https://www.facebook.com/Vodafone.Egypt/' },
    { label: 'Twitter', icon: 'icon-twitter', href: 'https://twitter.com/VodafoneEgypt' },
    { label: 'Instagram', icon: 'icon-instagram', href: 'https://www.instagram.com/vodafoneegypt/' },
    { label: 'Youtube', icon: 'icon-youtube', href: 'https://www.youtube.com/VodafoneEgypt' },
  ],
  footerColumns: [
    {
      title: 'About Vodafone',
      items: [
        { label: 'Careers', href: 'https://careers.vodafone.com/' },
        { label: 'News & press releases', href: `${VF}/en/newsroom` },
        { label: 'TV Commercials', href: 'https://www.youtube.com/user/vodafoneegypt' },
      ],
    },
    {
      title: 'Products and services',
      items: [
        { label: 'Shop', href: 'https://eshop.vodafone.com.eg/en/' },
        { label: 'DSL', href: 'https://eshop.vodafone.com.eg/en/internetServices/dsl/bundles' },
        { label: 'Broadband', href: `${VF}/en/mobile-internet-bundles` },
      ],
    },
    {
      title: 'Help',
      items: [
        { label: "Services FAQ's", href: `${VF}/en/faq` },
        { label: 'Call us', href: `${VF}/spa/contact-us` },
        { label: 'Store Locator', href: `${VF}/spa/storeLocator` },
      ],
    },
  ],
  footerLinks: [
    { label: 'Contact us', href: `${VF}/en/contact-us` },
    { label: 'Switch to business', href: `${VF}/en/business` },
    { label: 'Terms & conditions', href: `${VF}/en/website-terms-conditions` },
    { label: 'Privacy policy', href: `${VF}/en/privacy-policy-of-vodafone-egypt` },
  ],
}

/** The Arabic page's header and footer, as published on /ar/services (captured 2026-11-05). */
export const shellLinksAr = {
  home: `${VF}/ar/home`,
  language: `${VF}/en/services`,
  languageLabel: 'English',
  search: `${VF}/spa/search`,
  topNav: [
    { label: 'أفراد', href: `${VF}/ar/home`, active: true },
    { label: 'شركات', href: `${VF}/ar/business` },
    { label: 'ڤودافون مصر', href: `${VF}/ar/vodafone-egypt1` },
    { label: 'تغطية الشبكة', href: `${VF}/spa/NetworkCoverageChecker` },
    { label: 'Vodafone Egypt Foundation', href: `${VF}/en/foundation-home` },
  ],
  mainNav: [
    { label: 'تسوق', href: 'https://eshop.vodafone.com.eg/ar/' },
    { label: 'الخدمات', href: `${VF}/ar/services` },
    { label: 'العروض', href: `${VF}/ar/promotions` },
  ],
  social: shellLinks.social,
  footerColumns: [
    {
      title: 'عن ڤودافون',
      items: [
        { label: 'وظائف خالية', href: `${VF}/en/join-vodafone` },
        { label: 'النشرات الصحفية', href: `${VF}/ar/latest-news-2022` },
        { label: 'الإعلانات', href: 'https://www.youtube.com/user/vodafoneegypt' },
      ],
    },
    {
      title: 'خدمات ڤودافون',
      items: [
        { label: 'تسوق', href: 'https://eshop.vodafone.com.eg/ar/' },
        { label: 'DSL', href: 'https://eshop.vodafone.com.eg/ar/internetServices/dsl/bundles' },
        { label: 'انترنت', href: `${VF}/ar/mobile-internet-bundles` },
      ],
    },
    {
      title: 'المساعدة',
      items: [
        { label: 'الأسئلة الشائعة', href: `${VF}/ar/faq` },
        { label: 'كلمنا', href: `${VF}/spa/contact-us` },
        { label: 'محدد الفروع', href: `${VF}/spa/storeLocator` },
      ],
    },
  ],
  footerLinks: [
    { label: 'إتصل بنا', href: `${VF}/ar/contact-us` },
    { label: 'الأنتقال لخدمات الشركات', href: `${VF}/ar/business` },
    { label: 'الشروط والأحكام', href: `${VF}/ar/website-terms-conditions` },
    { label: 'اشعار الخصوصية', href: `${VF}/ar/privacy-policy-of-vodafone-egypt` },
  ],
  copyright: 'ڤودافون مصر',
}

const links = lang === 'ar' ? shellLinksAr : { ...shellLinks, languageLabel: 'العربية', copyright: 'Vodafone Egypt' }

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

const svg = String.raw

const externalAttrs = (href, label) =>
  `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)} (opens in a new tab)"`

export const sprite = svg`
  <svg class="sprite" aria-hidden="true" focusable="false">
    <symbol id="icon-vodafone-logo" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M47.95 23.952a23.993 23.993 0 0 1-24 24 23.907 23.907 0 0 1-23.9-24 23.886 23.886 0 0 1 23.9-23.9 23.972 23.972 0 0 1 24 23.9" fill="#e60000" fill-rule="evenodd" />
      <path d="M47.95 23.952a23.993 23.993 0 0 1-24 24 23.907 23.907 0 0 1-23.9-24 23.886 23.886 0 0 1 23.9-23.9 23.972 23.972 0 0 1 24 23.9z" fill="none" stroke="#fff" stroke-miterlimit="2.613" stroke-width=".216" />
      <path d="M37.877 25.142a13.023 13.023 0 0 1-13.222 12.822c-8.051 0-13.536-7.04-13.395-14.929 0-11.532 9.626-20.867 21.519-20.867q.743 0 1.472.049c-4.245 2.056-7.143 5.907-7.288 10.353a12.92 12.92 0 0 1 10.914 12.572" fill="#fff" fill-rule="evenodd" />
    </symbol>
    <symbol id="icon-search" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15.834" cy="15.834" r="11.667" fill="none" stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <path fill="none" stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M24.081 24.081l11.752 11.752" />
    </symbol>
    <symbol id="icon-vodafone-profile" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M32.5 34.187c-1.35-9.141-6.91-13.381-12.425-13.381S8.852 25.044 7.5 34.185" fill="none" stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
      <circle cx="20" cy="13.306" r="7.5" fill="none" stroke="#333" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
    </symbol>
    <symbol id="icon-vodafone-logo-white" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M36 18c0 9.941-8.059 18-18 18S0 27.941 0 18 8.059 0 18 0c2.746 0 5.35.615 7.678 1.715-.31-.097-.796-.133-1.262-.133-3.746.013-7.877 1.615-10.892 4.112-3.09 2.565-5.509 6.88-5.497 11.361.021 6.778 5.167 11 10.113 10.983 6.11-.02 9.722-5.04 9.706-9.615-.015-4.576-2.503-7.883-7.984-9.218a1.871 1.871 0 0 1-.022-.293c-.011-3.456 2.592-6.502 5.864-7.185C31.791 4.614 36 10.816 36 18z" />
    </symbol>
    <symbol id="icon-facebook" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M29.884 3.452H8.117a4.678 4.678 0 0 0-4.665 4.665v21.767a4.678 4.678 0 0 0 4.665 4.668h11.855V21.527h-2.72v-4.475h2.72v-2.6c0-3.59 1.415-5.749 5.613-5.749h3.716v4.47h-2.186c-1.613 0-1.7.531-1.7 1.7v2.179h3.761l-.472 4.47h-3.29v13.03h4.47a4.678 4.678 0 0 0 4.668-4.668V8.117a4.678 4.678 0 0 0-4.668-4.665z" fill="#fff" />
    </symbol>
    <symbol id="icon-twitter" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M36.139 11.569a12.851 12.851 0 0 1-3.559.985 6.342 6.342 0 0 0 2.738-3.46 12.168 12.168 0 0 1-3.948 1.522 6.224 6.224 0 0 0-10.59 5.7A17.622 17.622 0 0 1 7.957 9.784a6.277 6.277 0 0 0 1.942 8.348 6 6 0 0 1-2.806-.78v.068a6.228 6.228 0 0 0 4.975 6.119 6.443 6.443 0 0 1-2.806.115 6.221 6.221 0 0 0 5.8 4.328 12.51 12.51 0 0 1-9.196 2.56 17.572 17.572 0 0 0 9.51 2.826c11.437 0 17.684-9.51 17.684-17.762 0-.274 0-.55-.022-.8a11.926 11.926 0 0 0 3.101-3.237z" fill="#fff" />
    </symbol>
    <symbol id="icon-instagram" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M29.2719 10.4701C29.2104 9.05685 28.9647 8.07375 28.6574 7.21353C28.2888 6.35332 27.8587 5.61599 27.1214 4.87867C26.384 4.14134 25.6467 3.71123 24.7865 3.34257C23.9263 3.03535 22.9432 2.78957 21.53 2.72813C20.1167 2.66669 19.6252 2.66669 16 2.66669C12.3748 2.66669 11.9447 2.66669 10.47 2.72813C9.05684 2.78957 8.07375 3.03535 7.21353 3.34257C6.35332 3.71123 5.61598 4.14134 4.87865 4.87867C4.14132 5.61599 3.71122 6.35332 3.34255 7.21353C3.03533 8.07375 2.78956 9.05685 2.72811 10.4701C2.66667 11.8833 2.66667 12.3748 2.66667 16C2.66667 19.6252 2.66667 20.0553 2.72811 21.53C2.78956 22.9432 3.03533 23.9263 3.34255 24.7865C3.71122 25.6467 4.14132 26.384 4.87865 27.1214C5.61598 27.8587 6.35332 28.2888 7.21353 28.6575C8.07375 28.9647 9.05684 29.2104 10.47 29.2719C11.8833 29.3333 12.3748 29.3333 16 29.3333C19.6252 29.3333 20.0553 29.3333 21.53 29.2719C22.9432 29.2104 23.9263 28.9647 24.7865 28.6575C25.6467 28.2888 26.384 27.8587 27.1214 27.1214C27.8587 26.384 28.2888 25.6467 28.6574 24.7865C28.9647 23.9263 29.2104 22.9432 29.2719 21.53C29.3333 20.1168 29.3333 19.6252 29.3333 16C29.3333 12.3748 29.3333 11.9447 29.2719 10.4701ZM26.8756 21.4071C26.8141 22.6974 26.6298 23.4347 26.4455 23.8648C26.1997 24.4793 25.8925 24.9094 25.4624 25.4009C24.9708 25.8925 24.5407 26.1383 23.9263 26.384C23.4347 26.5684 22.7588 26.8141 21.4685 26.8141C20.0553 26.8756 19.6252 26.8756 16.0614 26.8756C12.4977 26.8756 12.0676 26.8756 10.6544 26.8141C9.36405 26.7527 8.62673 26.5684 8.19662 26.384C7.58218 26.1383 7.15207 25.831 6.66052 25.4009C6.16897 24.9094 5.92321 24.4793 5.67743 23.8648C5.4931 23.3733 5.24732 22.6974 5.24732 21.4071C5.18587 19.9939 5.18587 19.5638 5.18587 16C5.18587 12.4363 5.18587 12.0062 5.24732 10.5929C5.3034 9.41515 5.51308 8.6981 5.67743 8.13519C5.92321 7.52075 6.23041 7.09065 6.66052 6.5991C7.15207 6.10754 7.58218 5.86177 8.19662 5.61599C8.68817 5.43166 9.36405 5.18589 10.6544 5.18589C12.0676 5.12444 12.4977 5.12444 16.0614 5.12444C19.6252 5.12444 20.0553 5.12444 21.4685 5.18589C22.6463 5.24197 23.3634 5.45165 23.9263 5.61599C24.5407 5.86177 24.9708 6.16899 25.4624 6.5991C25.9539 7.09065 26.1997 7.52075 26.4455 8.13519C26.6298 8.62674 26.8756 9.30263 26.8756 10.5929C26.937 12.0058 26.937 12.4361 26.937 16.0027C26.937 19.564 26.937 19.9942 26.8756 21.4071ZM16 9.1183C12.1905 9.1183 9.11828 12.1905 9.11828 16C9.11828 19.8095 12.1905 22.8203 16 22.8203C19.8095 22.8203 22.8203 19.7481 22.8203 16C22.8817 12.1905 19.8095 9.1183 16 9.1183ZM16 20.424C13.5422 20.424 11.576 18.4578 11.576 16C11.576 13.5423 13.5422 11.5761 16 11.5761C18.4578 11.5761 20.424 13.5423 20.424 16C20.4854 18.4578 18.4578 20.424 16 20.424ZM21.5301 8.87252C21.5301 8.01231 22.2674 7.27498 23.1276 7.27498C24.0493 7.27498 24.7252 8.01231 24.7252 8.87252C24.7252 9.73274 23.9878 10.4701 23.1276 10.4701C22.2674 10.4701 21.5301 9.73274 21.5301 8.87252Z" />
    </symbol>
    <symbol id="icon-youtube" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M27.9125 8.08746C28.3263 8.50123 28.6241 9.01644 28.7761 9.58151C29.3333 11.6611 29.3333 16 29.3333 16C29.3333 16 29.3333 20.3389 28.7761 22.4185C28.6241 22.9836 28.3263 23.4988 27.9126 23.9126C27.4988 24.3263 26.9836 24.6241 26.4185 24.7761C24.3389 25.3334 16 25.3334 16 25.3334C16 25.3334 7.66111 25.3334 5.5815 24.7761C5.01644 24.6241 4.50122 24.3263 4.08745 23.9126C3.67369 23.4988 3.37589 22.9836 3.22389 22.4185C2.66667 20.3389 2.66667 16 2.66667 16C2.66667 16 2.66667 11.6611 3.22389 9.58151C3.37589 9.01644 3.67369 8.50123 4.08746 8.08747C4.50122 7.6737 5.01644 7.37591 5.5815 7.22391C7.66111 6.66669 16 6.66669 16 6.66669C16 6.66669 24.3389 6.66669 26.4185 7.22391C26.9836 7.37591 27.4988 7.6737 27.9125 8.08746ZM13.3334 12V19.9999L20.2612 16.0001L13.3334 12Z" />
    </symbol>
    <symbol id="icon-apple" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      <rect width="70" height="70" rx="12" fill="#fff" />
      <path d="M36.73 18.062a8.778 8.778 0 0 1 6.441-3.569 8.758 8.758 0 0 1-2.12 6.556c-2.859 3.435-6.108 2.873-6.108 2.873s-.609-2.701 1.787-5.86zm-1.448 8.199c1.386 0 3.959-1.906 7.308-1.906a9.154 9.154 0 0 1 8.033 4.1 8.906 8.906 0 0 0-4.436 7.771 9.133 9.133 0 0 0 5.526 8.347s-3.863 10.872-9.08 10.872c-2.4 0-4.259-1.615-6.784-1.615-2.573 0-5.126 1.675-6.789 1.675-4.759.002-10.778-10.312-10.778-18.601 0-8.156 5.094-12.434 9.873-12.434 3.106 0 5.517 1.791 7.132 1.791z" />
    </symbol>
    <symbol id="icon-android" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      <rect width="70" height="70" rx="12" fill="#fff" />
      <path d="M52.898 33.312a2.386 2.386 0 0 1 0 4.151L19.085 56.63C16.762 56.758 16 56.383 16 54.554V16.221c0-1.829.407-2.052 3.085-2.076z" fill="#00c8fe" />
      <path d="M37.468 35.388 16.556 14.485s1.789-.853 2.768-.3L44.35 28.374z" fill="#00f466" />
      <path d="M53.137 33.332a2.386 2.386 0 0 1 0 4.151l-8.718 4.942-7-7 6.927-7.074z" fill="#fecb00" />
      <path d="M37.467 35.388 16.556 56.291s1.789.853 2.768.3L44.35 42.402z" fill="#fe0142" />
    </symbol>
    <symbol id="icon-huawei" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
      <rect width="70" height="70" rx="15" fill="#f42f55" />
      <path d="M52.67 8.477a20.746 20.746 0 0 1-3.264 4.114 19.6 19.6 0 0 1-9.912 5.078 23.861 23.861 0 0 1-7.67.284 19.637 19.637 0 0 1-12.039-5.765 18.956 18.956 0 0 1-2.469-3.14c-.11-.173-.224-.343-.338-.515a3.41 3.41 0 0 1-.7-1.205 1.028 1.028 0 0 1 .468-1.053.9.9 0 0 1 1.047.363c.21.305.413.616.618.926a.359.359 0 0 1 .1.266 20.418 20.418 0 0 0 5.945 5.668 18.874 18.874 0 0 0 7.8 2.8 19.251 19.251 0 0 0 13.46-3.206 20.624 20.624 0 0 0 5.365-5.276 1.091 1.091 0 0 0 .057-.1.524.524 0 0 1 .139-.314 7.11 7.11 0 0 0 .49-.765.91.91 0 0 1 1.234-.274.88.88 0 0 1 .281 1.138c-.137.259-.268.522-.422.771-.047.078-.081.178-.19.205zM40.045 40.725l.544-1.6c.492-1.468.989-2.934 1.474-4.4.064-.193.137-.291.363-.276a9.462 9.462 0 0 0 1.03 0 .284.284 0 0 1 .33.239q.954 2.874 1.926 5.74l.105.307c.194-.587.373-1.123.549-1.66.476-1.453.954-2.9 1.419-4.36a.318.318 0 0 1 .372-.264c.548.015 1.1.005 1.678.005-.284.81-.555 1.585-.828 2.36-.764 2.162-1.534 4.322-2.289 6.487-.081.234-.183.327-.434.308a7.863 7.863 0 0 0-1 0c-.2.011-.285-.059-.352-.25-.634-1.824-1.279-3.643-1.922-5.463-.026-.074-.054-.147-.082-.221-.115.048-.108.162-.138.248q-.957 2.7-1.9 5.408a.338.338 0 0 1-.4.279 8.477 8.477 0 0 0-1 0 .32.32 0 0 1-.375-.262q-1.347-3.841-2.713-7.678c-.121-.342-.237-.685-.365-1.024-.053-.14-.039-.194.123-.192.55.006 1.1.01 1.65 0 .2-.005.21.129.252.257l1.876 5.726c.031.071.059.151.107.286z" fill="#fefefe" />
    </symbol>
  </svg>
`

export const svgUse = (icon, className) =>
  `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#${icon}"></use></svg>`

const renderFooterColumn = ({ title, items }) => `
  <div class="footer__column">
    <h3>${escapeHtml(title)}</h3>
    <ul>
      ${items.map((item) => `<li><a ${externalAttrs(item.href, item.label)}>${escapeHtml(item.label)}</a></li>`).join('')}
    </ul>
  </div>
`

const renderHeader = () => `
  <header class="site-header" id="site-header">
    <div class="switcher-bar">
      <div class="container switcher-bar__inner">
        <nav class="switcher-bar__nav" aria-label="${t('Vodafone sections')}">
          ${links.topNav
            .map(
              (item) =>
                `<a class="switcher-bar__link ${item.active ? 'is-active' : ''}" ${externalAttrs(item.href, item.label)}>${escapeHtml(item.label)}</a>`,
            )
            .join('')}
        </nav>
        <a class="switcher-bar__lang" ${externalAttrs(links.language, links.languageLabel)}>${escapeHtml(links.languageLabel)}</a>
      </div>
    </div>
    <div class="header-main">
      <div class="container header-main__inner">
        <a ${externalAttrs(links.home, 'Vodafone Home')} class="brand-mark">
          ${svgUse('icon-vodafone-logo', 'brand-mark__icon')}
        </a>
        <nav class="header-main__nav" aria-label="${t('Primary')}">
          ${links.mainNav.map((item) => `<a ${externalAttrs(item.href, item.label)}>${escapeHtml(item.label)}</a>`).join('')}
        </nav>
        <div class="header-main__tools">
          <a class="icon-button" ${externalAttrs(links.search, 'Search')}>
            ${svgUse('icon-search', 'icon-button__icon')}
          </a>
          <button class="icon-button" aria-label="${t('Profile')}">
            ${svgUse('icon-vodafone-profile', 'icon-button__icon')}
          </button>
        </div>
      </div>
    </div>
  </header>
`

const renderFooter = () => `
  <footer class="site-footer" id="site-footer">
    <div class="container">
      <div class="site-footer__top">
        <a ${externalAttrs(links.home, 'Vodafone Home')} class="site-footer__brand">
          ${svgUse('icon-vodafone-logo-white', 'site-footer__brand-icon')}
        </a>
        <div class="site-footer__social">
          ${links.social.map((item) => `<a ${externalAttrs(item.href, item.label)}>${svgUse(item.icon, 'social-icon')}</a>`).join('')}
        </div>
      </div>
      <hr />
      <div class="site-footer__columns">
        ${links.footerColumns.map(renderFooterColumn).join('')}
      </div>
      <ul class="site-footer__links">
        ${links.footerLinks.map((item) => `<li><a ${externalAttrs(item.href, item.label)}>${escapeHtml(item.label)}</a></li>`).join('')}
      </ul>
      <p class="site-footer__copyright">© <span id="js-year"></span> ${escapeHtml(links.copyright)}</p>
    </div>
  </footer>
`

/**
 * Renders the shell with an empty, replaceable <main>:
 *   #aixc-viewbar      view controls (outside the extraction scope)
 *   #source-content    the original page content (rendered by the page adapter)
 *   #experience-output the AIXC experience (hidden until a transformation exists)
 */
export const renderShell = (root) => {
  root.innerHTML = `
    ${sprite}
    <div class="page-shell">
      ${renderHeader()}
      <main id="main-content">
        <div id="aixc-viewbar" class="aixc-viewbar" hidden></div>
        <div id="source-content" class="source-content"></div>
        <div id="experience-output" class="experience-output" hidden></div>
      </main>
      ${renderFooter()}
    </div>
  `
  root.querySelector('#js-year').textContent = String(new Date().getFullYear())
  return {
    header: root.querySelector('#site-header'),
    footer: root.querySelector('#site-footer'),
    main: root.querySelector('#main-content'),
    viewbar: root.querySelector('#aixc-viewbar'),
    sourceRoot: root.querySelector('#source-content'),
    outputRoot: root.querySelector('#experience-output'),
  }
}
