// Illustrative rating update for the sample court on the home page. This is not the OPEN engine.
// The real formula will be published in the versioned rating spec.
(function () {
  const PLAYERS = [
    { name: "Juniper", rating: 4.14, reliability: 0.88, team: 0 },
    { name: "Marek", rating: 3.72, reliability: 0.34, team: 0 },
    { name: "Odalys", rating: 4.26, reliability: 0.91, team: 1 },
    { name: "Theo", rating: 3.98, reliability: 0.67, team: 1 },
  ];
  const WINNING_SCORE = 11;
  const LOWEST_RELIABILITY = PLAYERS.reduce((a, b) => (b.reliability < a.reliability ? b : a));

  const range = document.getElementById("score-range");
  if (!range) return;
  const byId = (id) => document.getElementById(id);

  const teamRating = (team) => {
    const members = PLAYERS.filter((p) => p.team === team);
    return members.reduce((sum, p) => sum + p.rating, 0) / members.length;
  };
  const ratings = [teamRating(0), teamRating(1)];
  const team1Expected = 1 / (1 + Math.pow(10, ratings[1] - ratings[0]));

  // Games go to 11 and must be won by 2, so the loser has at most 9 points.
  function scoreFromSlider(value) {
    return value <= 9 ? [value, WINNING_SCORE] : [WINNING_SCORE, 19 - value];
  }

  function formatChange(change) {
    const rounded = Math.abs(change).toFixed(2);
    return (change >= 0 ? "+" : "−") + rounded;
  }

  function render() {
    const [score1, score2] = scoreFromSlider(Number(range.value));
    const team1Won = score1 > score2;
    const margin = Math.abs(score1 - score2);
    const marginWeight = 0.6 + (0.8 * margin) / WINNING_SCORE;
    const surprise = (team1Won ? 1 : 0) - team1Expected;

    PLAYERS.forEach((player, index) => {
      const sensitivity = 0.04 + 0.14 * (1 - player.reliability);
      const direction = player.team === 0 ? 1 : -1;
      const change = sensitivity * surprise * marginWeight * direction;
      const card = document.querySelector('[data-player="' + index + '"]');
      const badge = card.querySelector("[data-change]");
      card.querySelector("[data-after]").textContent = (player.rating + change).toFixed(2);
      badge.textContent = formatChange(change);
      badge.toggleAttribute("data-down", change < 0);
    });

    const favorite = team1Expected >= 0.5 ? 1 : 2;
    const winner = team1Won ? 1 : 2;
    const loserScore = Math.min(score1, score2);
    const favoriteChance = Math.round(Math.max(team1Expected, 1 - team1Expected) * 100);

    byId("score-1").textContent = score1;
    byId("score-2").textContent = score2;
    range.setAttribute("aria-valuetext", "Team 1 " + score1 + ", Team 2 " + score2);
    byId("step-compare").textContent =
      "Team " + winner + " won " + WINNING_SCORE + " to " + loserScore +
      (winner === favorite
        ? ", as predicted, so ratings move less than they would after an upset."
        : ", an upset, so ratings move more than if the favorite had won.");
    byId("step-margin").textContent =
      "A " + margin + "-point game separates a close result from a decisive one.";
    byId("step-predict").textContent =
      "Averaging each pair, Team 2 is rated " + ratings[1].toFixed(2) + " and Team 1 is rated " +
      ratings[0].toFixed(2) + ", so Team " + favorite + " should win about " + favoriteChance + "% of the time.";
    byId("step-update").textContent =
      LOWEST_RELIABILITY.name + "'s rating is the least established of the four, so it moves the most.";
  }

  range.addEventListener("input", render);
  render();
})();
