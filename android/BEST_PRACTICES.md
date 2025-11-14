# Android Development Best Practices - Sovereign Communications

## Code Style

### Kotlin
- Use `val` over `var` when possible (immutability)
- Prefer expression bodies for single-line functions
- Use trailing commas in multi-line declarations
- Use named parameters for better readability
- Avoid `!!` (non-null assertion) - use safe calls or explicit checks

```kotlin
// Good
val result = repository.getData()?.map { it.value } ?: emptyList()

// Bad
val result = repository.getData()!!.map { it.value }
```

### Coroutines
- Always use `viewModelScope` or `lifecycleScope` for UI operations
- Use `Dispatchers.IO` for I/O operations
- Use `Dispatchers.Default` for CPU-intensive work
- Handle exceptions with try-catch or CoroutineExceptionHandler
- Cancel coroutines when no longer needed

```kotlin
viewModelScope.launch {
    try {
        withContext(Dispatchers.IO) {
            // I/O operation
        }
    } catch (e: Exception) {
        // Handle error
    }
}
```

### Compose
- Keep composables small and focused
- Extract reusable components
- Use `remember` for state that shouldn't recompose
- Use `derivedStateOf` for computed values
- Avoid side effects in composables (use `LaunchedEffect`, `DisposableEffect`)

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    LazyColumn {
        items(messages, key = { it.id }) { message ->
            MessageBubble(message)
        }
    }
}
```

## Performance

### Database
- Always use indices on frequently queried columns
- Batch insert/update operations when possible
- Use transactions for multiple operations
- Avoid N+1 queries (use joins or batch queries)
- Monitor query performance with Room's `@RawQuery`

```kotlin
// Good: Batch insert
messageDao.insertAll(messages)

// Bad: Individual inserts
messages.forEach { messageDao.insert(it) }
```

### UI
- Use `LazyColumn`/`LazyRow` for large lists
- Implement `key` parameter for stable item identity
- Use `remember` to cache expensive calculations
- Avoid nested LazyLayouts
- Use `Modifier.graphicsLayer()` for animations

### Memory
- Release resources in `onDestroy`/`DisposableEffect`
- Avoid memory leaks with weak references or lifecycle awareness
- Use `viewModelScope` for automatic cancellation
- Clean up listeners and observers
- Monitor memory with Android Profiler

## Security

### Data Storage
- Use EncryptedSharedPreferences for sensitive data
- Enable database encryption with SQLCipher
- Store keys in Android Keystore
- Never log sensitive information
- Clear sensitive data when no longer needed

### Network
- Always encrypt data before transmission
- Validate all incoming data
- Use certificate pinning for critical connections
- Implement timeout policies
- Handle connection failures gracefully

### Permissions
- Request minimum necessary permissions
- Explain why permissions are needed
- Handle denial gracefully
- Check permissions before each use
- Use runtime permissions (API 23+)

## Testing

### Unit Tests
- Test business logic independently
- Mock external dependencies
- Use coroutines test helpers
- Aim for >80% coverage
- Test edge cases and error conditions

```kotlin
@Test
fun `insert message updates conversation timestamp`() = runTest {
    val message = createTestMessage()
    messageDao.insert(message)
    
    val conversation = conversationDao.getConversation(message.conversationId)
    assertEquals(message.timestamp, conversation?.lastMessageTimestamp)
}
```

### UI Tests
- Test user flows, not implementation details
- Use semantic matchers (text, contentDescription)
- Test accessibility
- Handle asynchronous operations
- Use test tags for non-visible elements

```kotlin
@Test
fun clickSendButton_sendsMessage() {
    composeTestRule.onNodeWithText("Send")
        .performClick()
    
    composeTestRule.onNodeWithText("Message sent")
        .assertExists()
}
```

## Accessibility

### Content Descriptions
- Add descriptions to all interactive elements
- Describe icons and images
- Use action descriptions for buttons
- Update descriptions when state changes

```kotlin
Icon(
    imageVector = Icons.Default.Send,
    contentDescription = "Send message",
    modifier = Modifier.clickable { onSend() }
)
```

### Touch Targets
- Minimum 48dp for interactive elements
- Add padding if visual size is smaller
- Ensure adequate spacing between targets

```kotlin
IconButton(
    onClick = { },
    modifier = Modifier.size(48.dp)
) {
    Icon(...)
}
```

### Screen Readers
- Use semantic properties
- Group related content
- Provide context for actions
- Test with TalkBack enabled

## Battery Optimization

### Services
- Use foreground services appropriately
- Implement adaptive heartbeats
- Use partial wake locks (not full)
- Release wake locks when done
- Stop services when not needed

### Network
- Batch network requests
- Use exponential backoff for retries
- Cache responses when possible
- Avoid polling (use push notifications)
- Respect Doze mode and App Standby

### Background Work
- Use WorkManager for deferrable work
- Choose appropriate constraints
- Set exponential backoff policy
- Monitor battery state
- Respect battery saver mode

## Code Organization

### Package Structure
```
com.sovereign.communications/
├── data/           # Data layer (repositories, DAOs, entities)
├── domain/         # Business logic (use cases, models)
├── ui/             # Presentation layer (screens, components)
├── service/        # Background services
├── util/           # Utility classes
└── Application.kt  # Application class
```

### File Naming
- Activities: `XxxActivity.kt`
- Fragments: `XxxFragment.kt`
- ViewModels: `XxxViewModel.kt`
- Repositories: `XxxRepository.kt`
- DAOs: `XxxDao.kt`
- Entities: `XxxEntity.kt`

## Git Workflow

### Commits
- Write clear, descriptive commit messages
- Use conventional commits format
- Keep commits atomic and focused
- Reference issue numbers

```
feat: Add voice message recording
fix: Resolve database migration issue (#123)
docs: Update README with setup instructions
```

### Branches
- Feature branches: `feature/voice-messages`
- Bug fixes: `fix/crash-on-startup`
- Keep branches short-lived
- Rebase on main before merging

## Documentation

### Code Comments
- Use KDoc for public APIs
- Explain "why" not "what"
- Document non-obvious behavior
- Update comments when code changes

```kotlin
/**
 * Compresses an image to reduce file size for transmission
 * 
 * @param uri Source image URI
 * @param quality Compression quality (0-100), higher is better quality
 * @return Compressed image file, or null if compression fails
 */
suspend fun compressImage(uri: Uri, quality: Int): File?
```

### README
- Keep updated with latest changes
- Include setup instructions
- Document architecture decisions
- Provide examples for common use cases

## Resources

- [Android Developers](https://developer.android.com/)
- [Kotlin Style Guide](https://kotlinlang.org/docs/coding-conventions.html)
- [Material Design 3](https://m3.material.io/)
- [Android Architecture Guide](https://developer.android.com/topic/architecture)
- [Android Performance](https://developer.android.com/topic/performance)
