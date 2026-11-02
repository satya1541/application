/**
 * Official Playlists and Stations extracted directly from YouTube's Official Music Channel
 * Channel: https://www.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ
 */

export interface MusicChannelPlaylistCategory {
  id: string;
  name: string;
  icon: string;
  playlistId: string;
  shelfTitle: string;
  fallbackQuery: string;
}

export const YOUTUBE_MUSIC_CHANNEL_PLAYLISTS: MusicChannelPlaylistCategory[] = [
  {
    "id": "pl_bollywood_hitlist",
    "name": "Bollywood Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_n9Fbdw7e6ap-98_A-8JYBmPv64v-Uaq1g",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Bollywood Hitlist songs"
  },
  {
    "id": "pl_punjab_fire",
    "name": "Punjab Fire",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kuo_NioExeUmw07dFf8BzQ64DFFTlgE7Q",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Punjab Fire songs"
  },
  {
    "id": "pl_i_pop_hits",
    "name": "I-Pop Hits!",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_lj-zBExVYl7YN_NxXboDIh4A-wKGfgzNY",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "I-Pop Hits! songs"
  },
  {
    "id": "pl_tollywood_hitlist",
    "name": "Tollywood Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_lyVnWI5JnuwKJiuE-n1x-Un0mj9WlEyZw",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Tollywood Hitlist songs"
  },
  {
    "id": "pl_kollywood_hitlist",
    "name": "Kollywood Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_nTbyVypdXPQd00z15bTWjZr7pG-26yyQ4",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Kollywood Hitlist songs"
  },
  {
    "id": "pl_ekdum",
    "name": "EKDUM",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_mOvRWCE7v4C98UgkSVh5FTlD3osGjolas",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "EKDUM songs"
  },
  {
    "id": "pl_indie_rising",
    "name": "Indie Rising",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_n17q7_2dwfDqWckpccDyTTkZ-g03jXuII",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Indie Rising songs"
  },
  {
    "id": "pl_haryanvi_hitlist",
    "name": "Haryanvi Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_nhLiD_PquxQnzA35YpoaaAUv2ikZuYFgw",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Haryanvi Hitlist songs"
  },
  {
    "id": "pl_bhojpuri_hitlist",
    "name": "Bhojpuri Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_nlUHwf0SaQlGN6n_1ZtWhhplysMPwjP2k",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Bhojpuri Hitlist songs"
  },
  {
    "id": "pl_mollywood_hitlist",
    "name": "Mollywood Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_nT-zkEpc2x7AVVP0XV9JvHSfkFsOtGMR8",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Mollywood Hitlist songs"
  },
  {
    "id": "pl_sandalwood_hitlist",
    "name": "Sandalwood Hitlist",
    "icon": "trophy",
    "playlistId": "RDCLAK5uy_mPBQePobkU9UZ100tOTfvTCdwWOHoiiPo",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Sandalwood Hitlist songs"
  },
  {
    "id": "pl_bollywood_dance_hitlist",
    "name": "Bollywood Dance Hitlist",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kjNBBWqyQ_Cy14B0P4xrcKgd39CRjXXKk",
    "shelfTitle": "India's Biggest Hits",
    "fallbackQuery": "Bollywood Dance Hitlist songs"
  },
  {
    "id": "pl_bollywood_party",
    "name": "Bollywood Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_l_Bj8rMsjkhFMMs-eLrA17_zjr9r6g_Eg",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Bollywood Party songs"
  },
  {
    "id": "pl_punjabi_party",
    "name": "Punjabi Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_nlOMew8qv8HGXb9HbshuU1OgH3aL_JMKA",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Punjabi Party songs"
  },
  {
    "id": "pl_tollywood_party",
    "name": "Tollywood Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_nGC5IUV3lYF-P_wGb-LzMPFydA-RkPblc",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Tollywood Party songs"
  },
  {
    "id": "pl_desi_pop_party",
    "name": "Desi Pop Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_m_cn307EUnwiDOgAsOMM27CHhuJCX2ygk",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Desi Pop Party songs"
  },
  {
    "id": "pl_bhojpuri_party",
    "name": "Bhojpuri Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_n7VIYx-oWOJQanlpBG6GRyLZxpWYMltB8",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Bhojpuri Party songs"
  },
  {
    "id": "pl_haryanvi_party",
    "name": "Haryanvi Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_mN9vO_dypsJubNdWlO5JSTtCA0SI3o-88",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Haryanvi Party songs"
  },
  {
    "id": "pl_90s_bollywood_dance",
    "name": "90s Bollywood Dance",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kiDNaS5nAXxdzsqFElFKKKs0GUEFJE26w",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "90s Bollywood Dance songs"
  },
  {
    "id": "pl_machayenge_kya",
    "name": "Machayenge Kya",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_nSkDb-Lz4JW4INCXyg42stHqPqg4qCDfc",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Machayenge Kya songs"
  },
  {
    "id": "pl_kollywood_party",
    "name": "Kollywood Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kxyDfb8adHA-cigfDo_m-thB3GIvSiQSQ",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Kollywood Party songs"
  },
  {
    "id": "pl_indie_house_party",
    "name": "Indie House Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_mDQBWjkxNbiV9e4n49YdIBAFm9azhvrCI",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Indie House Party songs"
  },
  {
    "id": "pl_mollywood_party",
    "name": "Mollywood Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_lXm4Xn4GwyFVjP0xgJvoZ6cdeBJZUmgSw",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Mollywood Party songs"
  },
  {
    "id": "pl_marathi_party",
    "name": "Marathi Party",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kymAL5cE4HeekmTy6-3OXYuAucHRpvJ28",
    "shelfTitle": "Diwali szn 🪔🧨🏵️",
    "fallbackQuery": "Marathi Party songs"
  },
  {
    "id": "pl_top_weekly_videos_hindi",
    "name": "Top Weekly Videos Hindi",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn5RgLW0Sb_zECecWdH_4zOX",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Hindi songs"
  },
  {
    "id": "pl_top_weekly_videos_punjabi",
    "name": "Top Weekly Videos Punjabi",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn5JXkyIohg2RstsbL2SnRew",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Punjabi songs"
  },
  {
    "id": "pl_top_weekly_videos_telugu",
    "name": "Top Weekly Videos Telugu",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn5ALuqpEj_YZ8mEyw9WN8jd",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Telugu songs"
  },
  {
    "id": "pl_top_weekly_videos_tamil",
    "name": "Top Weekly Videos Tamil",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn4WX22qg1Po7qKOwOb4H6Sk",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Tamil songs"
  },
  {
    "id": "pl_top_weekly_videos_bhojpuri",
    "name": "Top Weekly Videos Bhojpuri",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn4ivDqrsepD3tvHsp0KTDRM",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Bhojpuri songs"
  },
  {
    "id": "pl_top_weekly_videos_haryanvi",
    "name": "Top Weekly Videos Haryanvi",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn4tiNLMZVGGt2Kghgw__2u0",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos Haryanvi songs"
  },
  {
    "id": "pl_top_weekly_videos_international",
    "name": "Top Weekly Videos International",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn49TUu37nJoN2QTeYuRwmNv",
    "shelfTitle": "Weekly Top Music Videos by Language",
    "fallbackQuery": "Top Weekly Videos International songs"
  },
  {
    "id": "pl_released",
    "name": "RELEASED",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_ksEjgm3H_7zOJ_RHzRjN1wY-_FFcs7aAU",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "RELEASED songs"
  },
  {
    "id": "pl_new_music_hindi",
    "name": "New Music Hindi",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_nNhhgRET3NcJ4SJBvqhAIJ6t7vjsQYowc",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Music Hindi songs"
  },
  {
    "id": "pl_pop_before_it_breaks",
    "name": "Pop Before It Breaks",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_kkkZR6KAV5kBSqDCeaBb_pDDhA83VGFwg",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "Pop Before It Breaks songs"
  },
  {
    "id": "pl_new_music_punjabi",
    "name": "New Music Punjabi",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_mk3xwsayv9PxawuXS-U6ao9eMeNmSwYAM",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Music Punjabi songs"
  },
  {
    "id": "pl_new_music_telugu",
    "name": "New Music Telugu",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_l8CaYQvBQWVT2st1VsW9JjODWisR_vd3U",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Music Telugu songs"
  },
  {
    "id": "pl_new_music_tamil",
    "name": "New Music Tamil",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_nVQAtE2KBWk-ROQIc5o39Oup3hOLnYV0g",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Music Tamil songs"
  },
  {
    "id": "pl_new_indian_pop",
    "name": "New Indian Pop",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_k66J6mE65JgdE4zoeNSzmw_16JB_ueINE",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Indian Pop songs"
  },
  {
    "id": "pl_ekdum_fresh",
    "name": "Ekdum Fresh",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_mDTfR8UPbTurG-Riq7QDI5mjT4a7H5eoI",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "Ekdum Fresh songs"
  },
  {
    "id": "pl_new_indian_indie",
    "name": "New Indian Indie",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_l8jPcXx__5Dsu2D7vTiXPlO8pZhZsjBFk",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Indian Indie songs"
  },
  {
    "id": "pl_new_music_haryanvi",
    "name": "New Music Haryanvi",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_nTkyDVpCk3iCQG_3bDJyhGgb1uzcBZM4A",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New Music Haryanvi songs"
  },
  {
    "id": "pl_clout_rising_new_hip_hop",
    "name": "Clout Rising: New Hip-Hop",
    "icon": "mic",
    "playlistId": "RDCLAK5uy_k7O9KByATGA1TqFYhyOkylpJ6fM1avtww",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "Clout Rising: New Hip-Hop songs"
  },
  {
    "id": "pl_new_r_b",
    "name": "New R&B",
    "icon": "sparkles",
    "playlistId": "RDCLAK5uy_nGZRi-an-ruqiZlNJSGhCDHucdp2FBNfI",
    "shelfTitle": "Discover New Music",
    "fallbackQuery": "New R&B songs"
  },
  {
    "id": "pl_the_hit_list",
    "name": "The Hit List",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "The Hit List songs"
  },
  {
    "id": "pl_on_everything_today_s_hip_hop_hits",
    "name": "On Everything: Today's Hip-Hop Hits",
    "icon": "mic",
    "playlistId": "RDCLAK5uy_lBGRuQnsG37Akr1CY4SxL0VWFbPrbO4gs",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "On Everything: Today's Hip-Hop Hits songs"
  },
  {
    "id": "pl_pop_certified",
    "name": "Pop Certified",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_lBNUteBRencHzKelu5iDHwLF6mYqjL-JU",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Pop Certified songs"
  },
  {
    "id": "pl_country_hotlist",
    "name": "Country Hotlist",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_lJ8xZWiZj2GCw7MArjakb6b0zfvqwldps",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Country Hotlist songs"
  },
  {
    "id": "pl_chroma_today_s_dance_hits",
    "name": "Chroma: Today's Dance Hits",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_kLWIr9gv1XLlPbaDS965-Db4TrBoUTxQ8",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Chroma: Today's Dance Hits songs"
  },
  {
    "id": "pl_chemistry_fresh_dance",
    "name": "Chemistry: Fresh Dance",
    "icon": "flash",
    "playlistId": "RDCLAK5uy_nHGuTnohZ82uuk0HQle7s-UgP7h3aoCqg",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Chemistry: Fresh Dance songs"
  },
  {
    "id": "pl_maximum_decibels_today_s_rock_hits",
    "name": "Maximum Decibels: Today's Rock Hits",
    "icon": "volume-high",
    "playlistId": "RDCLAK5uy_k5vcGRXixxemtzK1eKDS7BeHys7mvYOdk",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Maximum Decibels: Today's Rock Hits songs"
  },
  {
    "id": "pl_sub_condiment",
    "name": "Sub Condiment",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_kG3nZ1Boo4N_xKIZZcyZESTnLlhBgD06k",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Sub Condiment songs"
  },
  {
    "id": "pl_today_s_indie_hits",
    "name": "Today's Indie Hits",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_m0Nsi5Jnn_g6qbvc7fywPRhEv1qN0PcMM",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Today's Indie Hits songs"
  },
  {
    "id": "pl_diretoria_brazil_hits",
    "name": "Diretoria Brazil Hits",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_kvnwY7lh8VQkr7uLLsFPB06mhIwKAljbE",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Diretoria Brazil Hits songs"
  },
  {
    "id": "pl_highline_today_s_r_b_hits",
    "name": "Highline: Today's R&B Hits",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_mu-BhJj3yO1OXEMzahs_aJVtNWJwAwFEE",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "Highline: Today's R&B Hits songs"
  },
  {
    "id": "pl_k_ing",
    "name": "K.iNG",
    "icon": "globe",
    "playlistId": "RDCLAK5uy_k27uu-EtQ_b5U2r26DNDZOmNqGdccUIGQ",
    "shelfTitle": "Today's Global Hits ",
    "fallbackQuery": "K.iNG songs"
  },
  {
    "id": "pl_top_100_music_videos_india",
    "name": "Top 100 Music Videos India",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn40WjZ6utkIuj2rNg-7iGsq",
    "shelfTitle": "Charts",
    "fallbackQuery": "Top 100 Music Videos India songs"
  },
  {
    "id": "pl_top_100_songs_india",
    "name": "Top 100 Songs India",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn4pTWyM3t61lOyZ6_4jcNOw",
    "shelfTitle": "Charts",
    "fallbackQuery": "Top 100 Songs India songs"
  },
  {
    "id": "pl_trending_20_india",
    "name": "Trending 20 India",
    "icon": "trophy",
    "playlistId": "OLAK5uy_lSTp1DIuzZBUyee3kDsXwPgP25WdfwB40",
    "shelfTitle": "Charts",
    "fallbackQuery": "Trending 20 India songs"
  },
  {
    "id": "pl_top_100_songs_global",
    "name": "Top 100 Songs Global",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i",
    "shelfTitle": "Charts",
    "fallbackQuery": "Top 100 Songs Global songs"
  },
  {
    "id": "pl_top_100_music_videos_global",
    "name": "Top 100 Music Videos Global",
    "icon": "trophy",
    "playlistId": "PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM",
    "shelfTitle": "Charts",
    "fallbackQuery": "Top 100 Music Videos Global songs"
  },
  {
    "id": "pl_bollywood_romance_hitlist",
    "name": "Bollywood Romance Hitlist",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mypHeJ-B5f7-OgrxJcXeiHSotjIJ_UDhQ",
    "shelfTitle": "Romance",
    "fallbackQuery": "Bollywood Romance Hitlist songs"
  },
  {
    "id": "pl_make_out_jams_bollywood",
    "name": "Make Out Jams: Bollywood",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_lbfDqlFOiRJekoTwNgiES65gcham4ZelA",
    "shelfTitle": "Romance",
    "fallbackQuery": "Make Out Jams: Bollywood songs"
  },
  {
    "id": "pl_tollywood_romance_hitlist",
    "name": "Tollywood Romance Hitlist",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mErBkQfx-R-FQHnM6CsikE72lJlMuFKNs",
    "shelfTitle": "Romance",
    "fallbackQuery": "Tollywood Romance Hitlist songs"
  },
  {
    "id": "pl_punjabi_romance_hitlist",
    "name": "Punjabi Romance Hitlist",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mUvTtdERIHEiVAHIkV3GRndrY-H4M2nnA",
    "shelfTitle": "Romance",
    "fallbackQuery": "Punjabi Romance Hitlist songs"
  },
  {
    "id": "pl_kollywood_romance_hitlist",
    "name": "Kollywood Romance Hitlist",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mXUrV3_kqn3WUflvb3nZr35f3F5Q049H0",
    "shelfTitle": "Romance",
    "fallbackQuery": "Kollywood Romance Hitlist songs"
  },
  {
    "id": "pl_whispers_in_bed",
    "name": "Whispers In Bed",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_l-eWGUE283_FOVP60LfNdv6rjkDd-yGbQ",
    "shelfTitle": "Romance",
    "fallbackQuery": "Whispers In Bed songs"
  },
  {
    "id": "pl_i_pop_romance",
    "name": "I-Pop Romance",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_nvuvhmyPOP2y3L7hx-QYL7ABCl2E1amQQ",
    "shelfTitle": "Romance",
    "fallbackQuery": "I-Pop Romance songs"
  },
  {
    "id": "pl_sweetheart_pop",
    "name": "Sweetheart Pop",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_l1oO11DBO4FD8U7bOrqUKK5Y_PkISUMQM",
    "shelfTitle": "Romance",
    "fallbackQuery": "Sweetheart Pop songs"
  },
  {
    "id": "pl_bollywood_romance_essentials",
    "name": "Bollywood Romance Essentials",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mgEm8q7vw-VJ8DeKUOCZqKgileRj9GnQ4",
    "shelfTitle": "Romance",
    "fallbackQuery": "Bollywood Romance Essentials songs"
  },
  {
    "id": "pl_slow_romantic_punjabi_songs",
    "name": "Slow Romantic Punjabi Songs",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_mrtv7Q8jbt2mDcDC6z7wcWfk26dtOIBmc",
    "shelfTitle": "Romance",
    "fallbackQuery": "Slow Romantic Punjabi Songs songs"
  },
  {
    "id": "pl_old_hindi_romantic_songs",
    "name": "Old Hindi Romantic Songs",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_nLOvZAnN86K4f-fJ6tUi0xHUPBHLBBkVE",
    "shelfTitle": "Romance",
    "fallbackQuery": "Old Hindi Romantic Songs songs"
  },
  {
    "id": "pl_00s_bollywood_romance",
    "name": "00s Bollywood Romance",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_kWKAcJROkxDk9mOVmfDSv9cycK_-Ci2yA",
    "shelfTitle": "Romance",
    "fallbackQuery": "00s Bollywood Romance songs"
  },
  {
    "id": "pl_bollywood_retro_essentials",
    "name": "Bollywood Retro Essentials",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_mLJf8i5vYsqR7oTk6CNO4Ge49J3OU4sRs",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Bollywood Retro Essentials songs"
  },
  {
    "id": "pl_all_time_hip_hop_hits",
    "name": "All-Time Hip Hop Hits",
    "icon": "mic",
    "playlistId": "RDCLAK5uy_kw2wIlEv9llILhO0qoMTLsBBhmjzuibAc",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "All-Time Hip Hop Hits songs"
  },
  {
    "id": "pl_pop_s_biggest_hits",
    "name": "Pop's Biggest Hits",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_nmS3YoxSwVVQk9lEQJ0UX4ZCjXsW_psU8",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Pop's Biggest Hits songs"
  },
  {
    "id": "pl_iconic_kollywood_hits",
    "name": "Iconic Kollywood Hits",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_kGe1PylaE2pmTrZZZh8PWLlh7eelpeZwo",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Iconic Kollywood Hits songs"
  },
  {
    "id": "pl_telugu_retro_essentials",
    "name": "Telugu Retro Essentials",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_loJPSV6vieb07DOApAZTqxQ2xQ85p-ix8",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Telugu Retro Essentials songs"
  },
  {
    "id": "pl_carnatic_essentials",
    "name": "Carnatic Essentials",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_lGCIuty60Rwpfv_C841kKqn-1jZvggfZY",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Carnatic Essentials songs"
  },
  {
    "id": "pl_hindustani_essentials",
    "name": "Hindustani Essentials",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_lyuGyT2hcVaZaLltpUTw-2zy-9Jz0nTlY",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Hindustani Essentials songs"
  },
  {
    "id": "pl_ghazal_essentials",
    "name": "Ghazal Essentials",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_nusa99pjb23HT86uCZf-JW2rjJIGnpp_g",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Ghazal Essentials songs"
  },
  {
    "id": "pl_iconic_bollywood_hits",
    "name": "Iconic Bollywood Hits",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_ne9LK1yhdHJsvZNIsmDirK1WT-sl7q8sQ",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Iconic Bollywood Hits songs"
  },
  {
    "id": "pl_axomi_tamam_sangeet",
    "name": "Axomi Tamam Sangeet",
    "icon": "musical-notes",
    "playlistId": "RDCLAK5uy_lWl4R36HfTugJP8kuewuq11tzUIB-cvnU",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Axomi Tamam Sangeet songs"
  },
  {
    "id": "pl_all_india_indie",
    "name": "All India Indie",
    "icon": "planet",
    "playlistId": "RDCLAK5uy_kFs4DBLn3pFmAiXodtYyzaB5Xa_njue3A",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "All India Indie songs"
  },
  {
    "id": "pl_essential_heavy_metal",
    "name": "Essential Heavy Metal",
    "icon": "volume-high",
    "playlistId": "RDCLAK5uy_lhO-w4BZWObj7daKVuBz_A2wORvjyBCZU",
    "shelfTitle": "All Time Hits",
    "fallbackQuery": "Essential Heavy Metal songs"
  },
  {
    "id": "pl_90s_slow_jams",
    "name": "'90s Slow Jams",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_l9nSIU91U-FUBH_0P9wB3dVewP9gCwD2Y",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "'90s Slow Jams songs"
  },
  {
    "id": "pl_90s_kollywood",
    "name": "'90s Kollywood",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_n-6deo45Lmg4QTpcrmpalSGb46Z6eWpc4",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "'90s Kollywood songs"
  },
  {
    "id": "pl_90s_tollywood_romance",
    "name": "90s Tollywood Romance",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_nOk4cfi6qEweyqTpziNz5hUzjCRnLzOqw",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "90s Tollywood Romance songs"
  },
  {
    "id": "pl_90s_one_hit_wonders",
    "name": "'90s One-Hit Wonders",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_kiVGsxsxfhDCvIsBIQ1k3V0hRPeEz6SuE",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "'90s One-Hit Wonders songs"
  },
  {
    "id": "pl_90s_kollywood_romance",
    "name": "90s Kollywood Romance",
    "icon": "heart",
    "playlistId": "RDCLAK5uy_lG9Y0ygyS7rido4vIJF0reMGFWunV1d2Y",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "90s Kollywood Romance songs"
  },
  {
    "id": "pl_90s_chill_bollywood",
    "name": "90s Chill: Bollywood",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_lHpBhjR3PefMmM-_sCM4cWOY6AcpxtCIk",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "90s Chill: Bollywood songs"
  },
  {
    "id": "pl_90s_indian_pop",
    "name": "'90s Indian Pop",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_myv3cB_L96tlcINvAx0uS9LdgTdweJMYM",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "'90s Indian Pop songs"
  },
  {
    "id": "pl_essential_90s_r_b",
    "name": "Essential '90s R&B",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_ne3DJMol0EVIfwcuZnx2hQak0q6EbeBlY",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "Essential '90s R&B songs"
  },
  {
    "id": "pl_90s_hip_hop",
    "name": "'90s Hip Hop",
    "icon": "mic",
    "playlistId": "RDCLAK5uy_l0pAECrSAnyfXn-bgZ6XveIzAjDixOiX0",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "'90s Hip Hop songs"
  },
  {
    "id": "pl_90s_soothing_tollywood",
    "name": "90s Soothing Tollywood",
    "icon": "disc",
    "playlistId": "RDCLAK5uy_l5yCzA40GyoUM9jTOmiTp0xVj3Qx4Wjjk",
    "shelfTitle": "90s Magic",
    "fallbackQuery": "90s Soothing Tollywood songs"
  }
];
