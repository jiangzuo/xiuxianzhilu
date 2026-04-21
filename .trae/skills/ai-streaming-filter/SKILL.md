---
name: 流式输出过滤ai-streaming-filter
description: 过滤 AI 流式输出中的隐藏 JSON 数据。当 AI 回复包含不应展示给用户的结构化数据（如 JSON），或实现带隐藏元数据的流式 UI 时调用。
---

# AI Streaming Output Filter

## Problem

When AI returns both display text and structured data (JSON), the JSON leaks to the UI during streaming.

Example:
```
AI returns: "推荐你修炼散步... {\"id\": \"xxx\", \"name\": \"yyy\"}"
User sees:  "推荐你修炼散步... {"id": "xxx", "name": "yyy"}"  ❌
```

## Solution

Use delimiter-based truncation to separate display content from data.

### Step 1: Prompt Design

```javascript
const prompt = `
请推荐一个功法...

输出格式：
推荐语...
___TASK_DATA___
{"id": "功法id", "name": "功法名称"}
`;
```

### Step 2: Filter Function

```javascript
/**
 * Filter content for display (remove hidden JSON)
 */
const filterForDisplay = (content) => {
  // Split by delimiter or code block
  return content.split(/___TASK_DATA___|```json/)[0].trim();
};

/**
 * Extract JSON data from content
 */
const extractJsonData = (content) => {
  const match = content.match(/___TASK_DATA___\s*({[\s\S]*?})/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      return null;
    }
  }
  return null;
};
```

### Step 3: Stream Handling

```javascript
AIService.sendMessageStream(
  messages,
  // onStream - update UI with filtered content
  (chunk) => {
    fullContent += chunk;
    const displayText = filterForDisplay(fullContent);
    updateUi(displayText);
  },
  // onFinish - extract data
  () => {
    const displayText = filterForDisplay(fullContent);
    const jsonData = extractJsonData(fullContent);
    
    // Save only display text to history
    ChatService.saveMessage('assistant', displayText);
    
    // Use jsonData for business logic
    processTaskData(jsonData);
  }
);
```

## Best Practices

1. **Delimiter choice**: Use `___TASK_DATA___` or similar, avoid natural language patterns
2. **Always filter**: Both in stream callback and on finish
3. **Save clean text**: Store only filtered content in message history
4. **Handle errors**: JSON parse may fail, have fallback ready

## Alternative: JSON Mode

If AI supports it, request pure JSON and format it separately:

```javascript
// AI returns: {"message": "推荐语", "data": {...}}
// You format: message + buttons in UI
```