"use strict"
let programArea = document.getElementById("program");
let memoryArea = document.getElementById("memory");
let inputArea = document.getElementById("input");
let outputArea = document.getElementById("output");
let status = document.getElementById("status");
let addressOffset = document.getElementById("addressOffset");
let errorDiv = document.getElementById("error");
let memoryPointer = document.getElementById("memoryPointer");

function pasteHandler(e) {
	e.preventDefault();
	let text = e.clipboardData.getData("text/plain");
	document.execCommand("insertHTML", false, text);
}

programArea.addEventListener("paste", pasteHandler);
inputArea.addEventListener("paste", pasteHandler);

let runner = new CodeRunner();

runner.on("update", updateOnPause);

function runPressed() {
	if (checkShowError())
		return;
	if (runner.getHalted())
		runner.start(programArea.innerText, inputArea.innerText);
	runner.runToEnd();
	updateOnPause();
}

function runToBreakpointPressed() {
	if (checkShowError())
		return;
	if (runner.getHalted())
		runner.start(programArea.innerText, inputArea.innerText);
	runner.runToBreakpoint();
	updateOnPause();
}

function stepPressed() {
	if (checkShowError())
		return;
	if (runner.getHalted())
		runner.start(programArea.innerText, inputArea.innerText);
	runner.step(true);
	updateOnPause();
}

function stepMultPressed(count) {
	if (checkShowError())
		return;
	if (runner.getHalted())
		runner.start(programArea.innerText, inputArea.innerText);
	for (let i = 0; i<count; i++)
		runner.step();
	updateOnPause();
}

function stopPressed() {
	runner.stop();
}

function pausePressed() {
	runner.pause();
}

function updateOnPause() {
	let running = !runner.getHalted();
	status.innerText = running ? "Running" : "Idle";
	displayMemory();
	displayProgramCounter(!running);
	programArea.contentEditable = !running;
	outputArea.innerText = runner.getOutput();
}

function displayProgramCounter(hide) {
	for (let elem of programArea.getElementsByClassName("program-pointer"))
		unwrap(elem);
	if (hide)
		return;
	let offset = runner.getProgramCounter();

	let span = document.createElement("span");
	span.className = "program-pointer";

	programArea.innerHTML = programArea.innerText;
	wrap(span, programArea, offset);
}

function wrap(wrapper, parent, offset) {
	let curOffset = 0;
	for (let child of parent.childNodes) {
		if (child.nodeType != 3)
		{
			if (child.nodeType == 1)
				curOffset++;
			else
				curOffset += child.innerText;
			continue;
		}
		if (child.data.length + curOffset > offset) {
			let part1 = document.createTextNode(child.data.substring(0, offset - curOffset));
			let part2 = document.createTextNode(child.data.substring(offset - curOffset + 1));
			wrapper.innerText = child.data[offset - curOffset];
			let frag = document.createDocumentFragment();
			frag.append(part1);
			frag.append(wrapper);
			frag.append(part2);
			parent.replaceChild(frag, child)
			break;
		}
		else {
			curOffset += child.data.length;
		}
	}
}

function unwrap(element) {
	var docFrag = document.createDocumentFragment();
	while (element.firstChild) {
		var child = element.removeChild(element.firstChild);
		docFrag.appendChild(child);
	}
	element.parentNode.replaceChild(docFrag, element);
}

function displayMemory() {
	let i = Math.floor(addressOffset.value / 8) * 8;
	if (i === "")
		i = 0;
	i = Math.max(0, Math.min(i, 30000));
	let memory = runner.getMemory();
	let text = "";
	let end = i + 64 * 8;
	let curAddressPointer = runner.getMemoryPointer();
	let pointerInString = -1;
	let pointerInStringChar = -1;
	for (;i<memory.length && i<end;i+=8) {
		text += pad(i, 5) + ": ";
		for (let j = 0; j < 8; j++) {
			if (curAddressPointer == i+j)
				pointerInString = text.length;
			if (i + j > memory.length)
				break;
			text += pad(memory[i+j], 3) + " "
		}
		for (let j = 0; j < 8; j++) {
			if (curAddressPointer == i+j)
				pointerInStringChar = text.length;
			if (i + j > memory.length)
				break;
			text += memory[i+j] < 32 ? "." : String.fromCharCode(memory[i+j]);
		}
		text += "\n";
	}
	memoryArea.innerText = text;
	memoryPointer.innerText = curAddressPointer;

	if (pointerInString != -1)
	{
		let span = document.createElement("span");
		span.className = "memory-pointer";
		wrap(span, memoryArea, pointerInString);

		span = document.createElement("span");
		span.className = "memory-pointer";
		wrap(span, memoryArea, pointerInString+1);
		span = document.createElement("span");

		span.className = "memory-pointer";
		wrap(span, memoryArea, pointerInString+2);
	}
	if (pointerInStringChar != -1)
	{
		let span = document.createElement("span");
		span.className = "memory-pointer";
		wrap(span, memoryArea, pointerInStringChar);
	}
}

function pad(n, width, z) {
	z = z || '0';
	n = n + '';
	return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }

function checkCode(code) {
	let counter = 0;
	let charindex = 0;
	for (let char of code) {
		if (char == '[') {
			counter++;
		}
		else if (char == ']') {
			counter--;
		}
		if (counter < 0) {
			return charindex;
		}
		charindex++;
	}
	if (counter == 0)
		return -1;
	else
		return code.length - 1;
}

function highlightError(offset) {
	let span = document.createElement("span");
	span.className = "error-highlight";

	programArea.innerHTML = programArea.innerText;
	wrap(span, programArea, offset);
}

function checkShowError() {
	let index = checkCode(programArea.innerText);
	if (index == -1){
		errorDiv.innerText = "";
		return false;
	}
	highlightError(index);
	errorDiv.innerText = "Unbalanced brackets";
	return true;
}

function CodeRunner() {
	let listeners = {};
	this.on = function(event, handler) {
		if (!event || !handler)
			return;
		if (!listeners[event])
			listeners[event] = [];
		listeners[event].push(handler);
	}
	function emit(event, data) {
		if (!listeners[event])
			return;
		for (let handler of listeners[event]) {
			handler(data);
		}
	}


	let isIntervalActive = false;
	let isHalted = true;

	let program;
	let input;
	let output;
	let memory;
	let pointer;
	let stack;

	let execInterval;

	let iter;

	this.getIntervalActive = () => isIntervalActive;
	this.getHalted = () => isHalted;
	this.getMemory = () => memory;
	this.getProgramCounter = () => iter;
	this.getMemoryPointer = () => pointer;
	this.getOutput = () => output;

	this.stop = function() {
		if (!isIntervalActive)
		{
			isHalted = true;
			emit("update");
			return;
		}
		clearInterval(execInterval);
		isIntervalActive = false;
		isHalted = true;
		emit("update");
	}

	this.pause = function() {
		if (!isIntervalActive)
			return;
		clearInterval(execInterval);
		isIntervalActive = false;
		emit("update");
	}

	this.runToEnd = function() {
		if (isIntervalActive)
			return;
		isIntervalActive = true;
		execInterval = setInterval(() => execSteps.call(this, 10000000), 100);
	}

	this.runToBreakpoint = function() {
		if (isIntervalActive)
			return;
		isIntervalActive = true;
		execInterval = setInterval(() => execStepsBreakpoint.call(this, 10000000), 100);
	}

	this.start = function(code, inputData) {
		if (isIntervalActive)
			return;
		program = code;
		input = inputData;
		output = "";
		memory = new Array(30000).fill(0);
		pointer = 0;
		stack = [];
		iter = 0;
		isHalted = false;
	}

	this.step = function() {
		if (isIntervalActive || isHalted)
			return;
		
		internalStep();
	}

	function internalStep() {
		let token = program[iter];
		processToken(token);

		do {
			iter++;
		} while (!isExecCharacter(program[iter]) && iter < program.length);
		if (iter >= program.length) {
			isHalted = true;
		}
	}

	function isExecCharacter(character) {
		return character === '>' || character === '<' 
			|| character === '+' || character === '-' 
			|| character === '.' || character === ','
			|| character === '[' || character === ']'
			|| character === '*';
	}

	function execSteps(count) {
		while (count > 0) {
			count--;
			internalStep();
			if (isHalted) {
				isIntervalActive = false;
				clearInterval(execInterval);
				emit("update");
				return;
			}
		}
		emit("update");
	}

	function execStepsBreakpoint(count) {
		while (count > 0) {
			count--;
			internalStep();
			if (isHalted || program[iter] == '*') {
				isIntervalActive = false;
				clearInterval(execInterval);
				emit("update");
				return;
			}
		}
	}

	function processToken(token) {
		switch (token) {
			case '>':
				pointer = moveRight(pointer);
				return true;
			case '<':
				pointer = moveLeft(pointer);
				return true;
			case '+':
				memory[pointer] = increase(memory[pointer]);
				return true;
			case '-':
				memory[pointer] = decrease(memory[pointer]);
				return true;
			case '[':
				if (memory[pointer] == 0) {
					iter = findClosingBracket(program, iter);
				}
				else {
					stack.push(iter);
				}
				return true;
			case ']':
				if (memory[pointer] != 0) {
					iter = stack[stack.length-1];
				}
				else {
					stack.pop();
				}
				return true;
			case ',':
				if (input.length > 0) {
					memory[pointer] = input.charCodeAt(0);
					input = input.substr(1)
				}
				else {
					memory[pointer] = 0;
				}
				return true;
			case '.':
				output += String.fromCharCode(memory[pointer]);
				return true;
		}
	}

	function findClosingBracket(program, index) {
		let counter = 0;
		for (let i = index; i < program.length; i++) {
			if (program[i] == '[')
				counter++;
			else if (program[i] == ']')
				counter--;
			if (counter == 0)
				return i;
		}
	}

	function decrease(cell) {
		cell--;
		if (cell < 0)
			cell = 255;
		return cell;
	}

	function increase(cell) {
		cell++;
		if (cell >= 256)
			cell = 0;
		return cell;
	}

	function moveRight(pointer) {
		if (pointer < 30000 - 1)
			return pointer + 1;
		return pointer;
	}

	function moveLeft(pointer) {
		if (pointer > 0)
			return pointer - 1;
		return pointer;
	}
}