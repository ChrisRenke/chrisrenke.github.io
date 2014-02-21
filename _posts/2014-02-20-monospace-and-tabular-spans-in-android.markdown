---
layout: post
title:  "Monospace and Tabular Spans in Android"
date:   2014-02-20 20:53:41
permalink: /spans
comments: true
categories: android
tags: android spans spannables monospace tabular java
excerpt: Overcome a font's shortcomings with the power of Spans.
---

We recently switched the font used in our apps at Square from system default (Roboto on Android) to our own in-house font [Square Market](http://fontsinuse.com/uses/4981/square-cash-square-market). This came with a whole slew of pleasent visual variants, but it didn't have a monospaced version or any tabular digits, both of which are quite useful for passwords and rows of monetary amounts respectively. The idea arose: could we utilize a part of the Android platform to address these two shortcomings? But of course.


Research
-------- 
I found a great jumping off point from [Pierre-Yves Ricau](http://www.piwai.info/), a fellow Android developer at Square, who pointed me at a brand new blog post from [Flavien Laurent](http://flavienlaurent.com/) titled [Spans, a Powerful Concept.](http://flavienlaurent.com/blog/2014/01/31/spans/). The post has a fantastic breakdown on the many different types of Spans that come out of the box with Android and the various different Span base classes and their baggage; from a thorough reading and some additional investigation it was clear that a [`MetricAffectingSpan`](http://developer.android.com/reference/android/text/style/MetricAffectingSpan.html) was going a good jumping off point. Unfortunately, this class only gave you access to the `TextPaint`; it didn't seem to offer the level of granularity that would be needed to shift characters around with strange spacing. Cue [`ReplacementSpan`](http://developer.android.com/reference/android/text/style/ReplacementSpan.html) which fit all my needs nicely with direct access to a `draw()` method.


Approach
------------
Armed with the the right `Span` base class and pretty simple requirements; the code basically wrote itself.

Of `ReplacementSpan`'s four methods, two are commented to say literally "this method does nothing" leaving two remaining methods for the real meat of our spans, `getSize()` and `draw()`.

{% highlight java %}public int getSize(Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt fm)
{% endhighlight java %}
 
  This method should return how wide the given subset of `text` will appear when painted.

{% highlight java %}public void draw(Canvas canvas, CharSequence text, int start, int end, float x, int top,
 int y, int bottom, Paint paint){% endhighlight java %}

  This method is in charge of actually painting the given subset of `text` onto the `canvas` in the proper way. 


MonospaceSpan
-------------
For `MonospaceSpan`, the goal was quite simple: all characters should have the same allotted width on the canvas, and each character should be drawn centered. When used on a password field, this would make all the letters transition from characters to masking dots in a manner such that all the dots would be equally spaced apart regardless of the width of the individual letters themselves.

After looking at a few other potential usecases outside of password spanning, a couple constructors were deemed useful: one to use the widest character in the spanned string to for the monospace width, one to use the widest character in a given library string as the monospace width, and a no-args version that uses the widest of either 'M' or 'W' as the given monospace width.

{% highlight java %}
private static final String REFERENCE_CHARACTERS = "MW";

private final String relativeCharacters;

/** Set the {@code relativeMonospace} flag to true to monospace based on the widest character
  * in the content string; false will base the monospace on the widest width of 'M' or 'W'. */
public MonospaceSpan(boolean relativeMonospace) {
  this.relativeCharacters = relativeMonospace ? null : REFERENCE_CHARACTERS;
}

/** Use the widest character from {@code relativeCharacters} to determine monospace width. */
public MonospaceSpan(String relativeCharacters) {
  this.relativeCharacters = relativeCharacters;
}

public MonospaceSpan() {
  this.relativeCharacters = REFERENCE_CHARACTERS;
}
{% endhighlight java %}
    
The `getSize()` method is pretty straightforward here. We use a simple for-loop to find the widest character in our substring to use as our per-character monospace width. Our total substring width is then simply this monospace width multiplied by the number of characters in our subtring. We also need to set the `paint`'s font metrics to the given `fm` values or things get a bit out of whack (and no, that's not a type, the method really is called `get` not `set`).
    
{% highlight java %}
@Override
public int getSize(Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt fm) {
  if (fm != null) {
    paint.getFontMetricsInt(fm);
  }
  return (int) ceil((end - start) * getMonoWidth(paint, text.subSequence(start, end)));
}
  
private float getMonoWidth(Paint paint, CharSequence text) {
  text = relativeCharacters == null ? text : relativeCharacters;
  float maxWidth = 0;
  for (int i = 0; i < text.length(); i++) {
    maxWidth = Math.max(paint.measureText(text, i, i + 1), maxWidth);
  }
  return maxWidth;
}
{% endhighlight java %}

Lastly, we need to actually paint the given letters onto our `canvas`. Same as with `getSize()`, we want to obtain what the monospace width should be for our subset of characters to draw, then we use simple math to center each letter within its own monospace-width bit of the canvas.

{% highlight java %}
@Override
public void draw(Canvas canvas, CharSequence text, int start, int end, float x, int top, int y,
  int bottom, Paint paint) {
	CharSequence actualText = text.subSequence(start, end);
	float monowidth = getMonoWidth(paint, actualText);
	for (int i = 0; i < actualText.length(); i++) {
	  float textWidth = paint.measureText(actualText, i, i + 1);
	  float halfFreeSpace = (textWidth - monowidth) / 2f;
	  canvas.drawText(actualText, i, i + 1, x + (monowidth * i) - halfFreeSpace, y, paint);
	}
}
{% endhighlight java %}


TabularSpan
-------------
The goal of `TabularSpan` was to have multiple buckets of monospaced characters; in the example of our usecase of formatting money ammounts ($5,010.77), all the digit characters should have the same width X and all the delimiter characters like periods and commas should have the same width Z (any character not defined in these two groups will have its standard width). This ensures that when these values are right aligned, all the decimal points and commas will line up vertically for easy visual parsing. You can easily imagine how this could be useful for lots of IP addresses, phone numbers, ID numbers, or other numeric data.

Two constructors seemed to cover ours needs, but it would be very straightfoward to extend this to more buckets of tabularity. The no-args constructor uses standard number digits as the numeral group and both comma and period as the delimiter group; alternatively you can specify what characters those two groups should consist of.

{% highlight java %}
private static final String DEFAULT_DELIMITER_CHARACTERS = ",.";
private static final String DEFAULT_NUMERAL_CHARACTERS = "0123456789";

private final String delimiters;
private final String numerals;

public TabularSpan() {
  this.delimiters = DEFAULT_DELIMITER_CHARACTERS;
  this.numerals = DEFAULT_NUMERAL_CHARACTERS;
}

public TabularSpan(String delimiters, String numerals) {
  this.delimiters = delimiters;
  this.numerals = numerals;
}
{% endhighlight java %}
    
As with `MonospaceSpan`, we need to get the widest character to use as the monospace width, but here we have to do it for both the delimiter characters and the numeral characters. Once we have those widths, summing up the total width of this span is as easy as looping over the characters and adding the appropriate width to our total. 

{% highlight java %}
@Override
public int getSize(Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt fm) {
  if (fm != null) paint.getFontMetricsInt(fm);

  CharSequence actualText = text.subSequence(start, end);
  float numberWidth = getMaxCharacterWidth(paint, numerals);
  float delimiterWidth = getMaxCharacterWidth(paint, delimiters);
  float totalWidth = 0;

  for (int i = 0; i < actualText.length(); i++) {
    CharSequence character = actualText.subSequence(i, i + 1);
    if (delimiters.contains(character)) {
      totalWidth += delimiterWidth;
    } else if (numerals.contains(character)) {
      totalWidth += numberWidth;
    } else {
      totalWidth += paint.measureText(character, 0, 1);
    }
  }
  return (int) Math.ceil(totalWidth);
}

private static float getMaxCharacterWidth(Paint paint, CharSequence characters) {
  float maxWidth = 0;
  for (int i = 0; i < characters.length(); i++) {
    maxWidth = Math.max(paint.measureText(characters, i, i + 1), maxWidth);
  }
  return maxWidth;
}
{% endhighlight java %}

The `draw()` method is basically identical to the `MonospaceSpan` as well, with the sole difference that there is more than one bucket of monospacing to use when "centering" each letter in its bit of the canvas.

{% highlight java %}
@Override
public void draw(Canvas canvas, CharSequence text, int start, int end, float x, int top, int y,
    int bottom, Paint paint) {
  CharSequence actualText = text.subSequence(start, end);
  float numberWidth = getMaxCharacterWidth(paint, numerals);
  float delimiterWidth = getMaxCharacterWidth(paint, delimiters);

  for (int i = 0; i < actualText.length(); i++) {
    CharSequence character = actualText.subSequence(i, i + 1);
    float charWidth = paint.measureText(actualText, i, i + 1);
    float monoWidth;
    if (delimiters.contains(character)) {
      monoWidth = delimiterWidth;
    } else if (numerals.contains(character)) {
      monoWidth = numberWidth;
    } else {
      monoWidth = charWidth;
    }
    float halfFreeSpace = (monoWidth - charWidth) / 2f;
    canvas.drawText(actualText, i, i + 1, x + halfFreeSpace, y, paint);
    x += monoWidth;
  }
}
{% endhighlight java %}


Optimizations
-------------
From what I can tell (at least post-Honeycomb), we could safely cache the text between `getSize()` and `draw()` in both spans and keep the per-character width data for `TabularSpan`. This would save us from having to traverse the text again in `draw()`, but for the size of these spans and the the sake of simplicty, I've left the spans as they are. 


Shortcomings
------------
As a result of using ReplacementSpan, I have yet to find a way to gracefully handle being multiline. As a password field or a money formatter, being restricted to a single line of text is a non-issue; nonetheless, this is a somewhat awkard flaw for a general-use text Span. Additionally, while I haven't tested this with RTL langauges, it seems pretty obvious that this would draw the characters LTR. This should be fairly easy to fix with something like <a href="http://developer.android.com/reference/android/text/TextUtils.html#getLayoutDirectionFromLocale(java.util.Locale)">`getLayoutDirectionFromLocale`</a>, but it's API level 17, so no rush to get that implemented for us now.


Results
-------
And that's pretty much all there is to it. `ReplacementSpan` is a really powerful class that gives a pretty incredible level of control over text formatting, keep it in mind next time you come up against some sort of odd formatting needs.


Source
------
I've posted both `MonospaceSpan` and `TabularSpan` to a tiny little repo [here](https://github.com/ChrisRenke/FixedSpans); there's a small sample activity that will demonstrate them as well.  Pull requests welcome!

---

<div id="disqus_thread"></div>
<script type="text/javascript">
    /* * * CONFIGURATION VARIABLES: EDIT BEFORE PASTING INTO YOUR WEBPAGE * * */
    var disqus_shortname = 'chrisrenke'; // required: replace example with your forum shortname

    /* * * DON'T EDIT BELOW THIS LINE * * */
    (function() {
        var dsq = document.createElement('script'); dsq.type = 'text/javascript'; dsq.async = true;
        dsq.src = '//' + disqus_shortname + '.disqus.com/embed.js';
        (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(dsq);
    })();
</script>
<noscript>Please enable JavaScript to view the <a href="http://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>
<a href="http://disqus.com" class="dsq-brlink">comments powered by <span class="logo-disqus">Disqus</span></a>

