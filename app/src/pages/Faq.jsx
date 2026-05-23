// Frequently-asked questions, in the loosest sense of "asked". Mostly an
// excuse to write some jokes and a tiny excuse to add a real-feeling
// website footer.
const QA = [
  {
    q: 'Why is it called Maybe Movie Mondays if we sometimes meet on Tuesdays?',
    a: `Maybe Movie Tuesdays is a different group. They're meaner. We do
    not associate with them.`,
  },
  {
    q: "What if everyone votes 'thumbs down' on every movie?",
    a: `Then we have, philosophically, succeeded. Practically, you'll get
    suggested a Hallmark movie. We have to draw the line somewhere.`,
  },
  {
    q: 'Can I bring my dog?',
    a: `Yes, but the dog gets a vote. If your dog is opinionated about
    cinéma vérité, we'd love to meet them.`,
  },
  {
    q: 'Is the popcorn included?',
    a: `Popcorn is a posture, not an inclusion. Bring your own and it'll be
    everyone's. Try not to bring just one bag.`,
  },
  {
    q: 'How does the Bechdel test work?',
    a: `Two named women have a conversation about something other than a
    man. That's it. The bar is on the floor and we still trip over it
    constantly.`,
  },
  {
    q: 'Can I leave early?',
    a: `You can do anything. Whether you should is a deeper question that
    we're not equipped to answer. The door's right there. We'll miss you.`,
  },
  {
    q: 'What if I picked the movie and now I hate it?',
    a: `This is character development. Pause it, tell us, and rate it
    "really_dont_like" — that lets the algorithm protect future-you from
    your past mistakes.`,
  },
  {
    q: "Why don't we just watch a real classic instead?",
    a: `We've tried. Someone always falls asleep before the third act. Real
    classics require real commitment. Maybe Mondays is for accessible art.`,
  },
  {
    q: 'Is this a cult?',
    a: `A cult would have a logo. We've talked about getting a logo. Stay
    tuned.`,
  },
  {
    q: 'Can I propose a marriage during the credits?',
    a: `Strongly preferred to during the movie. Please do not propose
    during the credits of "Marriage Story" specifically.`,
  },
  {
    q: 'Is there an iOS app?',
    a: `No. There is a website. It works on your phone. That is, in a
    legal sense, an app.`,
  },
];

export default function Faq() {
  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>FAQ</h1>
      <p style={{ color: 'var(--muted)' }}>
        Frequently-asked, occasionally answered.
      </p>
      <div className="faq-list">
        {QA.map(({ q, a }, i) => (
          <details key={i} className="faq-item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
