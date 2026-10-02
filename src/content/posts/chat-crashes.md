---
title: '가드를 달아도 다시 나오는 크래시 두 개'
description: '채팅 화면의 binding NPE와 RecyclerView의 "Scrapped or attached views may not be recycled"를 추적하고, 막는 대신 없앤 이야기.'
date: 2026-10-02
---

채팅 화면에는 고쳐도 다시 나오는 크래시가 두 개 있었다. 하나는 `binding` NPE이고, 하나는 RecyclerView의 `Scrapped or attached views may not be recycled`다.

둘 다 여러 번 "고쳤다". 고칠 때마다 가드가 하나씩 늘었다. 이 글은 그 가드들이 왜 소용없었는지에 대한 기록이다.

## 크래시 1: getBinding NPE

스택은 이랬다.

```
AsyncListDiffer.latchList
  → submitList 커밋 콜백
    → notifyAdjacentItems
      → getBinding   ← NPE
```

목록이 갱신된 뒤 불리는 콜백에서 `binding`을 읽는데, 그 시점에 Fragment의 뷰가 이미 없어진 것이다.

### lazy로 바꾸면 안 되나

내 첫 생각은 `binding`을 `by lazy`로 바꾸는 것이었다. null이 될 일이 없으니 NPE도 없다.

안 된다. Fragment는 인스턴스가 뷰보다 오래 산다. 백스택에 들어갔다 나오면 뷰는 새로 만들어지는데, lazy는 처음 만든 뷰를 계속 들고 있다. 그 옛날 뷰의 root를 다시 붙이려는 순간 `The specified child already has a parent`가 난다. 가끔 나는 NPE를 매번 나는 크래시로 바꾸는 방법이다.

### 가드는 이미 있었다

원인으로 처음 나온 가설은 코루틴 스코프였다. 뷰가 죽은 뒤에도 코루틴이 돌았을 거라는 추측이다. 코드를 보니 그런 형태가 아니었다. 가설을 버렸다.

실제 코드는 이런 모양이었다.

```kotlin
val recyclerView = binding.chat      // ← 여기서 터진다
recyclerView.post {
    if (_binding == null) return@post   // ← 가드는 여기 있다
    ...
}
```

작성자는 위험을 알고 있었다. `post {}` 안은 나중에 실행되니까 가드를 달았다. 그런데 `post`를 걸기 위해 RecyclerView를 꺼내는 바로 윗줄이 가드 밖에 있었다. 콜백 자체가 뷰가 죽은 뒤에 불리면 그 한 줄에서 터진다.

### 고치는 방법 세 가지, 전부 기각

세어보니 채팅 Fragment 다섯 개에서 `binding`에 접근하는 곳이 304곳이었다. 그중 다음 프레임 이후에 실행될 수 있는 진입점이 23곳이었다.

- **23곳을 안전한 헬퍼로 감싼다**: 반나절. 24번째가 생기지 않는다는 보장이 없다.
- **커스텀 Lint 규칙을 만든다**: 2~3일. 규칙이 못 잡는 형태가 나오면 끝이다.
- **304곳의 접근 방식을 전부 바꾼다**: 3~4일. 가장 확실하지만, 여전히 "조심해서 쓰는" 구조다.

내가 물은 건 하나였다. 이렇게 고치면 앞으로 쭉 안 생긴다고 보장할 수 있느냐. 셋 다 답은 "아니다"였다.

### Fragment일 이유가 없었다

`_binding`이 nullable인 이유는 Fragment의 뷰가 Fragment보다 먼저 죽기 때문이다. Activity는 그렇지 않다. 같은 프로젝트의 다른 채팅 화면은 Activity였고, `lateinit var binding` 하나에 가드가 0개였다.

이 화면이 Fragment였던 이유는 하나였다. React Native 화면 안에 네이티브 뷰를 끼워 넣어야 했다. 그 제약만 없애면 Fragment일 이유가 없다.

Activity로 옮겼다. 가드 304개를 관리하는 문제가 가드가 필요 없는 문제로 바뀌었다.

뜯어보다가 알게 된 것도 있다. 옵저버 등록이 `onViewCreated`가 아니라 `onCreateView`에서 불리고 있었다. 뷰가 다 만들어지기 전에 관찰을 시작하는 셈이다.

## 크래시 2: Scrapped or attached views may not be recycled

RecyclerView가 던지는 `IllegalArgumentException`이다. 아직 화면에 붙어 있거나 임시 보관 중인 뷰를 재활용 풀에 넣으려 할 때 난다. 레이아웃이나 스크롤이 도는 중에 목록 상태가 바뀌면 이렇게 된다.

### 예외를 삼키는 레이아웃 매니저

코드를 열어보니 커스텀 `LinearLayoutManager`가 있었다. `scrollVerticallyBy`와 `onLayoutChildren`에서 이 예외를 catch하고 무시한다. 주석이 달려 있었다.

```kotlin
// Catch instead of crashing
```

RecyclerView 쪽 `onLayout`에도 같은 방어막이 있었다. 세어보니 세 겹이었다.

그런데도 크래시가 났다. 이번 스택은 이 경로였다.

```
ViewFlinger.run → dispatchLayout
```

스크롤 애니메이션이 스스로 레이아웃을 부르는 경로다. 세 겹의 방어막 어디도 지나지 않는다.

원인은 `smoothScrollToPosition`이 도는 도중에 `submitList`가 겹친 것이었다. 새 메시지가 오면 맨 아래로 부드럽게 스크롤하는데, 그 사이에 메시지가 또 오면 목록이 바뀐다. 채팅 화면에서 이건 드문 일이 아니다.

급한 대로 목록을 갱신하기 직전에 `stopScroll()`을 넣었다. 방어막이 네 겹이 됐다.

### catch가 만든 다른 버그

이력을 거슬러 올라가니 더 나쁜 게 있었다. 몇 달 전에 그 catch를 넣은 커밋이, 같이 있던 여분 레이아웃 공간 계산을 함께 빼버렸다. 그 뒤로 크래시는 줄었는데 스크롤이 버벅이기 시작했다.

크래시를 버벅임으로 바꾼 것이다. 크래시는 리포트에 찍히지만 버벅임은 안 찍힌다. 숫자로는 좋아진 것처럼 보인다.

### 진짜 문제는 어댑터였다

예외가 나는 이유는 목록의 상태와 RecyclerView가 아는 상태가 어긋나서다. 어긋나게 만드는 코드가 어댑터에 있었다.

- 작성 중인 메시지를 실제 목록에 넣지 않고, `getItemCount()`에 1을 더해 가상 아이템으로 끼웠다.
- 그 가상 아이템을 갱신하려고 `notifyItemChanged`를 직접 불렀다. 목록은 diff로 갱신되고 있는데.
- 어두운 테마용 어댑터가 따로 있었다. 401줄짜리 사본이다.

diff 기반 갱신과 수동 notify가 섞이면, 둘이 엇갈리는 타이밍이 반드시 온다. catch를 몇 겹 두르든 그 타이밍을 없애지는 못한다.

### 없앴다

어댑터를 고치는 대신 RecyclerView를 걷어냈다. 목록은 `LazyColumn(reverseLayout = true)`에 key를 준 형태가 됐고, 작성 중인 메시지는 맨 아래 슬롯 하나가 됐다.

그러자 필요 없어진 것들이다.

- 예외를 삼키던 레이아웃 매니저와 방어막 네 겹
- `notifyItemChanged` 직접 호출
- 스크롤 위치 수동 보정
- 가상 아이템을 늦게 처리하려고 두던 필드 6개
- 1,186줄짜리 어댑터와 401줄짜리 사본

## 두 크래시의 공통점

둘 다 같은 순서를 밟았다.

1. 크래시가 난다.
2. 터진 줄에 가드를 단다.
3. 다른 줄에서 터진다.
4. 2번으로 돌아간다.

가드는 "이 줄에서는 안 터진다"만 보장한다. 터질 수 있는 구조는 그대로 둔다. 그리고 가드가 쌓일수록 구조를 건드리기가 더 무서워진다. 저 catch를 지우면 뭐가 터질지 아무도 모르니까.

빠져나온 방법은 두 번 다 같았다. "어떻게 막을까"를 그만 묻고, "왜 이게 가능한 구조인가"를 물었다. 첫 번째 답은 Fragment였고, 두 번째 답은 수동 notify였다.

Compose가 답이었다는 얘기는 아니다. XML로도 고칠 수 있었다. 다만 어차피 Compose로 옮길 화면이었고, 옮기면 문제가 통째로 사라지는 걸 굳이 한 번 더 고칠 이유가 없었다.
