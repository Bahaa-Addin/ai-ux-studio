/**
 * Function words removed before retrieval. Written in normalised form
 * (see normalize.ts). Intent words ("cheapest", "subscribe", "عرفني") are NOT
 * here: intents read the full normalised text. Egyptian dialect question words
 * and demonstratives are included because spoken requests are full of them.
 */
const EN = `a an the is are was were be been am do does did i me my mine we our you your it its this that these those
there here what whats what's which who whom how where when why can could would should will shall may might must
to of for in on at by from with about into over under up down out off and or but if so than then too very just
please show tell give find see let know want need like get got have has had im i'm id i'd ill i'll some any
one ones all also not no yes ok okay hey hi hello say says said mean means look go take open`.split(/\s+/)

const AR = `في فى من الي الى علي على عن مع او ام و ف ب ل ك ما ماذا ايه اي ايه؟ ازاي كيف فين اين هل انا انت انتي احنا
هو هي هم ده دي دا دول هذا هذه ذلك تلك اللي الذي التي لو ممكن عايز عاوز عايزه عاوزه اريد ابغي بدي يا بس كده كدا
بقي لسه طيب يعني مش ليه علشان عشان لان حاجه حاجات اعرف قولي قوللي وريني ورينى فيه فيها عندي عندك عندكم بكام كام`.split(/\s+/)

export const STOPWORDS: ReadonlySet<string> = new Set([...EN, ...AR])
