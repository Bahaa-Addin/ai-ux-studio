import './style.css'

const topNav = [
  'Personal',
  'Business',
  'ڤودافون مصر',
  'Network Coverage Map',
  'Vodafone Egypt Foundation',
]

const mainNav = ['Shop', 'Services', 'Promotions']

const stayInControl = [
  {
    title: 'Balance transfer',
    image: '/assets/images/transfer.png',
  },
  {
    title: 'End of Call notifications',
    image: '/assets/images/end-call.png',
  },
  {
    title: 'Calls services',
    image: '/assets/images/call-services.png',
  },
  {
    title: 'International balance transfer',
    image: '/assets/images/international-transfer.png',
  },
]

const abroadCards = [
  {
    title: 'Roaming',
    body:
      'Roaming Services Stay connected with your family and loved ones with calls, SMS and unlimited Internet with no worries and at the best rates',
    image: '/assets/images/roaming.png',
  },
  {
    title: 'Visiting Egypt',
    body:
      "Roam with Vodafone, the world's mobile leader, while visiting Egypt and enjoy a variety of extraordinary telecommunication solutions.",
    image: '/assets/images/visiting-egypt.png',
  },
  {
    title: 'International standarad rates',
    body: 'Stay in connected with anyone everywhere with our international calling',
    image: '/assets/images/international-rates.png',
  },
]

const entertainmentWidgets = [
  {
    layout: 'single',
    items: [
      {
        title: 'Mo Salah World',
        body: 'Subscribe and stay updated with all news &videos of M.Salah',
        image: '/assets/images/mo-salah-world.png',
      },
    ],
  },
  {
    layout: 'double',
    items: [
      {
        title: '3alam Mama',
        body: 'Get information from the moment of pregnancy till your child is older',
        image: '/assets/images/3alam-mama.png',
      },
      {
        title: 'Henedy World',
        body: "Subscribe &stay connected with all Henedy's news, behind the scenes ,memes and more",
        image: '/assets/images/henedy-world.png',
      },
    ],
  },
  {
    layout: 'triple-reverse',
    items: [
      {
        title: 'VF Play',
        body: 'Enjoy the ultimate gaming experience with VF Play for free',
        image: '/assets/images/vf-play.png',
      },
      {
        title: '90 Mins',
        body: 'Know the latest news of the European league',
        image: '/assets/images/90-mins.png',
      },
      {
        title: 'Play&Win',
        body: 'Answer 10 questions correctly and win 10,000 pounds',
        image: '/assets/images/play-win.png',
      },
    ],
  },
  {
    layout: 'single',
    items: [
      {
        title: 'El Hadaba World',
        body: "Know Amr Diab's latest news",
        image: '/assets/images/amr-diab.png',
      },
    ],
  },
]

const shokranCards = [
  {
    title: 'Sallefny Shokran',
    body: 'Now you can borrow from 4 LE up to 32LE depending on your usage',
    image: '/assets/images/sallefny-shokran.png',
  },
  {
    title: 'Kallemny Shokran',
    body: 'Now get 2 free “Kallemny Shokran” messages per day to Vodafone numbers.',
    image: '/assets/images/kallemny-shokran.png',
  },
  {
    title: '3alnota Shokran',
    body: "Your calls aren't finished even if you run out of balance",
    image: '/assets/images/3alnota-shokran.png',
  },
  {
    title: 'Edfa3ly Shokran',
    body: 'Now you can call any Vodafone number at his expenses.',
    image: '/assets/images/edfa3ly-shokran.png',
  },
  {
    title: 'Rennely Shokran',
    body: 'If your credit finished, your calls do not. With "Rennely Shokran" service',
    image: '/assets/images/rennely-shokran.png',
  },
  {
    title: 'Wasalny Shokran',
    body: 'With Vodafone, don’t let the traffic stop you.',
    image: '/assets/images/wasalny-shokran.png',
  },
]

const otherServiceCards = [
  {
    title: 'Mini Call',
    body: 'Minicall is a service that allows you to record a voice message and send it to any mobile number in Egypt.',
    image: '/assets/images/mini-call.png',
  },
  {
    title: 'Multi sim',
    body: 'NOW YOU CAN! Enjoy the best network with your same number',
    image: '/assets/images/multi-sim.png',
  },
  {
    title: 'Short numbers',
    body: 'Send a song to a friend, listen to the latest music or change the logo and ringtone of your phone',
    image: '/assets/images/short-numbers.png',
  },
  {
    title: 'visa-appointment',
    body: 'With the Visa Appointment service, you can find out the procedures for visa applications, and schedule appointments for visa interviews.',
    image: '/assets/images/visa-appointment.png',
  },
  {
    title: 'park-your-line',
    body: 'Park your line temporarily with Vodafone',
    image: '/assets/images/park-your-line.png',
  },
  {
    title: 'Vodafone-advertising',
    body: "Find out about the latest offers and discounts available at your favorite stores in Egypt with Vodafone's personalized Mobile Advertising service!",
    image: '/assets/images/vodafone-advertising.png',
  },
  {
    title: 'Vodafone Arabeety Service',
    body: 'Vodafone in cooperation with ETIT company is offering a real-time tracking service for your vehicle anywhere & anytime.',
    image: '/assets/images/vodafone-arabeety.png',
  },
  {
    title: 'Join us without changing your number',
    body: 'Now you can enjoy Vodafone network with your same number.',
    image: '/assets/images/join-without-changing-number.png',
  },
]

const footerColumns = [
  {
    title: 'About Vodafone',
    items: ['Careers', 'News & press releases', 'TV Commercials'],
  },
  {
    title: 'Products and services',
    items: ['Shop', 'DSL', 'Broadband'],
  },
  {
    title: 'Help',
    items: ["Services FAQ's", 'Call us', 'Store Locator'],
  },
]

const footerLinks = ['Contact us', 'Switch to business', 'Terms & conditions', 'Privacy policy']

const svg = String.raw

const sprite = svg`
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

const svgUse = (icon, className) =>
  `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#${icon}"></use></svg>`

const renderStayCard = ({ title, image }) => `
  <article class="action-card action-card--small action-card--center">
    <img src="${image}" alt="${title}" class="action-card__image" />
    <div class="action-card__overlay action-card__overlay--red"></div>
    <div class="action-card__body action-card__body--center">
      <h3>${title}</h3>
      <p class="action-card__view">View more</p>
    </div>
  </article>
`

const renderSubscriptionCard = ({ title, body, image }) => `
  <article class="subscription-card">
    <img src="${image}" alt="${title}" class="subscription-card__image" />
    <div class="subscription-card__body">
      <h3>${title}</h3>
      <p>${body}</p>
    </div>
  </article>
`

const renderEntertainmentCard = ({ title, body, image }) => `
  <article class="action-card action-card--entertainment">
    <img src="${image}" alt="${title}" class="action-card__image" />
    <div class="action-card__overlay action-card__overlay--dark"></div>
    <div class="action-card__body">
      <div>
        <h3>${title}</h3>
        <p>${body}</p>
      </div>
      <span class="button button--primary action-card__button">Subscribe now</span>
    </div>
  </article>
`

const renderWidget = ({ layout, items }) => {
  const classMap = {
    single: 'widget widget--single',
    double: 'widget widget--double',
    'triple-reverse': 'widget widget--triple-reverse',
  }

  return `
    <div class="${classMap[layout]}">
      ${items.map(renderEntertainmentCard).join('')}
    </div>
  `
}

const renderFooterColumn = ({ title, items }) => `
  <div class="footer__column">
    <h3>${title}</h3>
    <ul>
      ${items.map((item) => `<li><a href="#">${item}</a></li>`).join('')}
    </ul>
  </div>
`

document.querySelector('#app').innerHTML = `
  ${sprite}
  <div class="page-shell">
    <header class="site-header">
      <div class="switcher-bar">
        <div class="container switcher-bar__inner">
          <nav class="switcher-bar__nav" aria-label="Vodafone sections">
            ${topNav
              .map(
                (item, index) =>
                  `<a class="switcher-bar__link ${index === 1 ? 'is-active' : ''}" href="#">${item}</a>`,
              )
              .join('')}
          </nav>
          <a class="switcher-bar__lang" href="#">العربية</a>
        </div>
      </div>
      <div class="header-main">
        <div class="container header-main__inner">
          <a href="#" class="brand-mark" aria-label="Vodafone Home">
            ${svgUse('icon-vodafone-logo', 'brand-mark__icon')}
          </a>
          <nav class="header-main__nav" aria-label="Primary">
            ${mainNav.map((item) => `<a href="#">${item}</a>`).join('')}
          </nav>
          <div class="header-main__tools">
            <button class="icon-button" aria-label="Search">
              ${svgUse('icon-search', 'icon-button__icon')}
            </button>
            <button class="icon-button" aria-label="Profile">
              ${svgUse('icon-vodafone-profile', 'icon-button__icon')}
            </button>
          </div>
        </div>
      </div>
    </header>

    <main>
      <section class="hero-banner">
        <img src="/assets/images/hero-banner.jpg" alt="Vodafone services banner" />
        <div class="hero-banner__overlay"></div>
      </section>

      <section class="section section--intro">
        <div class="container cash-intro">
          <div class="cash-intro__media">
            <img src="/assets/images/vf-cash.png" alt="Vodafone Cash icon" />
          </div>
          <div class="cash-intro__copy">
            <h1>Vodafone Cash</h1>
            <p>
              Vodafone Cash is an E-Wallet provided by Vodafone to make your life easier and
              run all your errands with a click.
            </p>
          </div>
          <div class="cash-intro__cta">
            <a href="#" class="button button--primary button--wide">View more</a>
          </div>
        </div>
      </section>

      <section class="section section--muted">
        <div class="container">
          <div class="section-heading section-heading--center">
            <h2>Stay In Control</h2>
            <p>Manage your line , your payment, balance, and all the services you need</p>
          </div>
          <div class="stay-grid">
            ${stayInControl.map(renderStayCard).join('')}
          </div>
        </div>
      </section>

      <section class="section section--muted section--tight-top">
        <div class="container">
          <div class="section-heading section-heading--center">
            <h2>Call &amp; Connect abroad</h2>
          </div>
          <div class="subscription-grid">
            ${abroadCards.map(renderSubscriptionCard).join('')}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container section-heading">
          <h2 class="heading-small">Great Entertainment</h2>
          <p>Enjoy entertainment services from Vodafone and select your favorite</p>
          <a href="#" class="button button--primary">Download Ana Vodafone App</a>
        </div>
        <div class="container container--bleed-right">
          <div class="entertainment-rail">
            ${entertainmentWidgets.map(renderWidget).join('')}
          </div>
        </div>
        <div class="container">
          <div class="mini-qr-card">
            <img src="/assets/images/ana-vodafone-qr.png" alt="Ana Vodafone QR Code" />
            <div>
              <h3>Download Ana Vodafone</h3>
              <p>Scan the QR to enjoy the service</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section section--muted">
        <div class="container">
          <div class="section-heading section-heading--center">
            <h2>Shokran services</h2>
          </div>
          <div class="carousel-frame">
            <button class="carousel-frame__arrow" aria-hidden="true">‹</button>
            <div class="subscription-grid subscription-grid--carousel">
              ${shokranCards.slice(0, 3).map(renderSubscriptionCard).join('')}
            </div>
            <button class="carousel-frame__arrow" aria-hidden="true">›</button>
          </div>
          <div class="carousel-dots" aria-hidden="true">
            <span class="is-active"></span>
            <span></span>
          </div>
        </div>
      </section>

      <section class="section section--muted section--tight-top">
        <div class="container">
          <div class="section-heading section-heading--center">
            <h2>Enjoy other services</h2>
          </div>
          <div class="carousel-frame">
            <button class="carousel-frame__arrow" aria-hidden="true">‹</button>
            <div class="subscription-grid subscription-grid--carousel">
              ${otherServiceCards.slice(0, 3).map(renderSubscriptionCard).join('')}
            </div>
            <button class="carousel-frame__arrow" aria-hidden="true">›</button>
          </div>
          <div class="carousel-dots" aria-hidden="true">
            <span class="is-active"></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </section>

      <section class="download-band">
        <div class="container download-band__inner">
          <div class="download-band__copy">
            <h2>Download Ana Vodafone App</h2>
            <p class="download-band__lead">And Manage all your services</p>
            <p>Join Vodafone and get the best services designed for you !</p>
            <div class="download-band__stores">
              <span>Available on:</span>
              <div class="store-icons">
                <a href="#" aria-label="Apple App Store">${svgUse('icon-apple', 'store-icon')}</a>
                <a href="#" aria-label="Google Play">${svgUse('icon-android', 'store-icon')}</a>
                <a href="#" aria-label="Huawei AppGallery">${svgUse('icon-huawei', 'store-icon')}</a>
              </div>
            </div>
          </div>
          <div class="download-band__qr">
            <h3>Scan QR CODE &amp; Download</h3>
            <img src="/assets/images/cta-qr-code.png" alt="Vodafone app QR code" />
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container">
        <div class="site-footer__top">
          <a href="#" class="site-footer__brand" aria-label="Vodafone Home">
            ${svgUse('icon-vodafone-logo-white', 'site-footer__brand-icon')}
          </a>
          <div class="site-footer__social">
            <a href="#" aria-label="Facebook">${svgUse('icon-facebook', 'social-icon')}</a>
            <a href="#" aria-label="Twitter">${svgUse('icon-twitter', 'social-icon')}</a>
            <a href="#" aria-label="Instagram">${svgUse('icon-instagram', 'social-icon')}</a>
            <a href="#" aria-label="Youtube">${svgUse('icon-youtube', 'social-icon')}</a>
          </div>
        </div>
        <hr />
        <div class="site-footer__columns">
          ${footerColumns.map(renderFooterColumn).join('')}
        </div>
        <ul class="site-footer__links">
          ${footerLinks.map((item) => `<li><a href="#">${item}</a></li>`).join('')}
        </ul>
        <p class="site-footer__copyright">© <span id="js-year"></span> Vodafone Egypt</p>
      </div>
    </footer>
  </div>
`

document.querySelector('#js-year').textContent = String(new Date().getFullYear())
