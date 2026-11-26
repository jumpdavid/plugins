#!/usr/bin/env bash
# Audit worktrees by size, merge state, uncommitted work, PR state, and
# recorded chat history. Refresh the base ref when it tracks origin.
# Report cleanup candidates without removing worktrees.
#
# Usage: worktree-audit.sh [--history cursor|codex] [-b|--base <ref>] [repo-path]
#   repo-path defaults to the current repo.
#   --history selects Cursor transcripts (default) or scoped Codex thread metadata.
#   -b sets the ref the MERGED column checks against (e.g. origin/integration).
#   Without it the base is origin/HEAD, then origin/main, then origin/master.
#   origin/HEAD is the remote's default branch, not necessarily the branch PRs
#   merge into; pass -b when they differ.
set -u

base=""
history_source=cursor
while [ $# -gt 0 ]; do
	case "$1" in
	-b|--base) [ $# -ge 2 ] || { echo "error: $1 needs a ref" >&2; exit 2; }; base="$2"; shift 2 ;;
	--history) [ $# -ge 2 ] || { echo "error: $1 needs cursor or codex" >&2; exit 2; }; history_source="$2"; shift 2 ;;
	-h|--help) sed -n '2,/^set -u/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
	-*) echo "error: unknown option: $1" >&2; exit 2 ;;
	*) break ;;
	esac
done
case "$history_source" in
	cursor|codex) ;;
	*) echo "error: unknown history source: $history_source" >&2; exit 2 ;;
esac
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P) || exit 1

repo="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$repo" ] && { echo "not in a git repo; pass a repo path" >&2; exit 1; }
cd -- "$repo" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "error: not a git repo: $repo" >&2; exit 1; }

# Main worktree is the first entry; retain full paths, including spaces.
worktrees=()
while IFS= read -r -d '' field; do
	case "$field" in worktree\ *) worktrees+=("${field#worktree }");; esac
done < <(git worktree list --porcelain -z)
main_wt=${worktrees[0]:-}
[ -n "$main_wt" ] || { echo "error: could not list worktrees" >&2; exit 1; }

if [ -z "$base" ]; then
	for cand in "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" origin/main origin/master; do
		[ -n "$cand" ] && git rev-parse --verify --quiet "$cand^{commit}" >/dev/null && { base="$cand"; break; }
	done
	[ -z "$base" ] && { echo "error: no base ref (origin/HEAD, origin/main, origin/master all missing); pass -b <ref>" >&2; exit 1; }
	echo "warn: no -b given; MERGED checks against $base" >&2
fi

# The base drives the merge check. The fetch is best-effort (stale is fine for
# a first pass) and runs before the check, since -b may name a branch not
# fetched yet. The explicit refspec creates it even in a single-branch clone.
case "$base" in
origin/*) git fetch origin "+refs/heads/${base#origin/}:refs/remotes/$base" --quiet 2>/dev/null \
	|| echo "warn: could not fetch $base; merged column may be stale" >&2 ;;
esac
git rev-parse --verify --quiet "$base^{commit}" >/dev/null 2>&1 || { echo "error: base ref not found: $base" >&2; exit 1; }

# PR state by branch, fetched once as [{number, state, head}] with a lowercase
# state. Origin when its CLI can read this repo's PRs, otherwise gh. Empty when
# neither can.
prs=$(mktemp) || exit 1
trap 'rm -f -- "$prs"' EXIT
if command -v origin >/dev/null 2>&1 \
	&& raw=$(origin pr list --author "@me" --state all --limit 1000 \
		--json number,status,headRef 2>/dev/null); then
	printf '%s' "$raw" | jq '[.[] | {number, state: (.status | ascii_downcase), head: .headRef}]' > "$prs" 2>/dev/null
elif raw=$(gh pr list --author "@me" --state all --limit 1000 \
	--json number,state,headRefName 2>/dev/null); then
	printf '%s' "$raw" | jq '[.[] | {number, state: (.state | ascii_downcase), head: .headRefName}]' > "$prs" 2>/dev/null
fi
[ -s "$prs" ] || echo "[]" > "$prs"

if stat -c %Y / >/dev/null 2>&1; then
	stat_fmt=(-c '%Y'); fmt_day() { date -d "@$1" '+%Y-%m-%d'; }
else
	stat_fmt=(-f '%m'); fmt_day() { date -r "$1" '+%Y-%m-%d'; }
fi

case "$history_source" in
	cursor)
		slug=$(printf '%s' "$main_wt" | sed 's#^/##; s#/#-#g')
		transcripts="$HOME/.cursor/projects/$slug/agent-transcripts"
		;;
	codex)
		codex_history='{}'
		if [ "${#worktrees[@]}" -gt 1 ]; then
			if ! codex_history=$(node "$script_dir/codex-worktree-history.mjs" "${worktrees[@]:1}"); then
				echo "warn: Codex history unavailable; unknown worktrees require review" >&2
				codex_history='{}'
			fi
		fi
		;;
esac
now=$(date +%s)

echo "# base: $base"
printf "SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tBUCKET\tWORKTREE\n"

for wt in "${worktrees[@]:1}"; do
	size=$(du -sh "$wt" 2>/dev/null | awk '{print $1}')
	head=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
	head_ts=$(git -C "$wt" log -1 --format='%ct' HEAD 2>/dev/null || echo 0)
	age=$([ "$head_ts" -gt 0 ] 2>/dev/null && echo "$(( (now - head_ts) / 86400 ))d" || echo "?")

	# A PR associated with a branch name may describe a different commit.
	git merge-base --is-ancestor "$head" "$base" 2>/dev/null
	case $? in
		0) merged=YES ;;
		1) merged=no ;;
		*) merged=unknown ;;
	esac

	if ! porcelain=$(git -C "$wt" status --porcelain --untracked-files=normal 2>/dev/null); then dirty=unknown
	elif [ -z "$porcelain" ]; then dirty=clean
	elif printf '%s\n' "$porcelain" | grep -qv '^??'; then
		dirty="wip:$(printf '%s\n' "$porcelain" | grep -cv '^??')"
	else dirty="untracked:$(printf '%s\n' "$porcelain" | grep -c '^??')"; fi

	branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
	if [ -z "$branch" ]; then remote=detached
	elif git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
		[ "$(git -C "$wt" rev-parse "origin/$branch" 2>/dev/null)" = "$head" ] \
			&& remote=pushed \
			|| remote="ahead$(git -C "$wt" rev-list --count "origin/$branch..HEAD" 2>/dev/null)"
	else remote=no-remote; fi

	pr=$([ -n "$branch" ] && jq -r --arg b "$branch" '
		map(select(.head == $b)) |
		(map(select(.state == "open" or .state == "draft"))[0] // .[0]) |
		select(. != null) | "#\(.number)/\(.state)"' "$prs" 2>/dev/null)
	[ -z "$pr" ] && pr="-"

	last_ts=0; pinned_or_active=false
	case "$history_source" in
		cursor)
			if [ -d "$transcripts" ]; then
				# Match the full path and its delimiter so sibling names cannot collide.
				while IFS= read -r -d '' transcript; do
					ts=$(stat "${stat_fmt[@]}" "$transcript" 2>/dev/null) || continue
					[ "$ts" -gt "$last_ts" ] && last_ts=$ts
				done < <(rg -l -0 -F -e "${wt}/" -e "${wt}\"" "$transcripts" 2>/dev/null)
			fi
			;;
		codex)
			IFS=$'\t' read -r last_ts pinned_or_active < <(
				jq -r --arg wt "$wt" '.[$wt] | [.timestamp // 0, .hold // false] | @tsv' <<< "$codex_history"
			)
			;;
	esac
	last=unknown
	if [ "${last_ts:-0}" -gt 0 ]; then last=$(fmt_day "$last_ts" 2>/dev/null) || last=unknown; fi

	if [ "$dirty" = unknown ] || [ "$merged" = unknown ]; then bucket=review-git-unknown
	elif [[ "$dirty" == wip:* ]]; then bucket=hold-wip
	elif [[ "$dirty" == untracked:* ]]; then bucket=hold-untracked
	elif [[ "$pr" == */open || "$pr" == */draft ]]; then bucket=hold-open-pr
	elif [ "$pinned_or_active" = true ]; then bucket=verify-recent-chat
	elif [ "$last" = unknown ]; then bucket=review-history-unknown
	elif [ $(( (now - last_ts) / 86400 )) -le 4 ]; then bucket=verify-recent-chat
	elif [ "$merged" = YES ]; then bucket=safe
	else bucket=review
	fi

	printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
		"$size" "$age" "$merged" "$dirty" "$remote" "$pr" "$last" "$bucket" "$wt"
done | sort -t$'\t' -k1,1 -rh
